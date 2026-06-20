import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract, Interface, Wallet, getAddress } from 'ethers';
import { User } from '../user/entities/user.entity';
import { CatAssetBatch } from './entities/cat-asset-batch.entity';
import { CatMetadataItem } from './entities/cat-metadata-item.entity';
import { CatMintRecord } from './entities/cat-mint-record.entity';
import { MintCreditLedger } from './entities/mint-credit-ledger.entity';
import { UserService } from '../user/user.service';
import { EVM_NETWORK, getEvmProvider } from '../config/evm-network.config';

const CAT_NFT_READ_ABI = [
  'function voucherSigner() view returns (address)',
  'function baseURI() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Minted(address indexed to, uint256 indexed tokenId)',
] as const;

const CAT_NFT_INTERFACE = new Interface(CAT_NFT_READ_ABI);

@Injectable()
export class CatnftService {
  private readonly logger = new Logger(CatnftService.name);
  private pinataJwt: string | null = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CatAssetBatch)
    private readonly batchRepository: Repository<CatAssetBatch>,
    @InjectRepository(CatMetadataItem)
    private readonly metadataRepository: Repository<CatMetadataItem>,
    @InjectRepository(CatMintRecord)
    private readonly mintRepository: Repository<CatMintRecord>,
    @InjectRepository(MintCreditLedger)
    private readonly mintCreditLedgerRepository: Repository<MintCreditLedger>,
    private readonly userService: UserService,
  ) {}

  private getPinataJwt() {
    if (this.pinataJwt) return this.pinataJwt;

    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      this.logger.warn('PINATA_JWT is not set; uploads will fail');
      return null;
    }

    this.pinataJwt = jwt;
    return jwt;
  }

  private async pinFileToIpfs(filename: string, buffer: Buffer, mime: string) {
    const jwt = this.getPinataJwt();
    if (!jwt) throw new Error('Pinata client not configured');

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);

    const metadata = {
      name: filename,
      keyvalues: {
        source: 'inj-pass-catnft',
      },
    };

    form.append('pinataMetadata', JSON.stringify(metadata));
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pinata file upload failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { IpfsHash?: string };
    if (!data.IpfsHash) {
      throw new Error('Pinata file upload returned no IpfsHash');
    }

    return data.IpfsHash;
  }

  private async pinJsonToIpfs(payload: Record<string, unknown>) {
    const jwt = this.getPinataJwt();
    if (!jwt) throw new Error('Pinata client not configured');

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: {
          name: String(payload.name || 'cat-metadata'),
          keyvalues: {
            source: 'inj-pass-catnft',
          },
        },
        pinataContent: payload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pinata JSON upload failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { IpfsHash?: string };
    if (!data.IpfsHash) {
      throw new Error('Pinata JSON upload returned no IpfsHash');
    }

    return data.IpfsHash;
  }

  private getCatNftContractAddress() {
    const contractAddress = process.env.CAT_NFT_CONTRACT_ADDRESS;
    if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
      throw new BadRequestException('CAT_NFT_CONTRACT_ADDRESS is invalid');
    }
    return getAddress(contractAddress);
  }

  private async assertCatNftContractReady(expectedSigner?: string) {
    const contractAddress = this.getCatNftContractAddress();
    const provider = getEvmProvider();
    const code = await provider.getCode(contractAddress);

    if (!code || code === '0x') {
      throw new BadRequestException(
        `No CatNFT contract found at ${contractAddress} on ${EVM_NETWORK.networkName}. Check CAT_NFT_CONTRACT_ADDRESS and INJECTIVE_EVM_CHAIN_ID.`,
      );
    }

    if (expectedSigner) {
      const contract = new Contract(contractAddress, CAT_NFT_READ_ABI, provider);
      const onChainSigner = getAddress(await contract.voucherSigner());
      if (onChainSigner !== getAddress(expectedSigner)) {
        throw new BadRequestException(
          `CAT_NFT_VOUCHER_SIGNER_PRIVATE_KEY does not match the on-chain voucherSigner for ${contractAddress}.`,
        );
      }
    }

    return contractAddress;
  }

  private async resolveMetadataItemForTokenId(tokenId: string, requestedMetadataItemId?: number) {
    if (requestedMetadataItemId) {
      const requested = await this.metadataRepository.findOne({
        where: { id: requestedMetadataItemId },
      });
      if (requested) return requested;
    }

    const serialNo = Number(tokenId);
    if (!Number.isSafeInteger(serialNo) || serialNo <= 0) {
      return null;
    }

    return this.metadataRepository
      .createQueryBuilder('item')
      .innerJoin(CatAssetBatch, 'batch', 'batch.id = item.batchId')
      .where('item.serialNo = :serialNo', { serialNo })
      .andWhere('batch.status = :status', { status: 'active' })
      .orderBy('batch.id', 'DESC')
      .getOne();
  }

  private async resolveMintFromReceipt(txHash: string, expectedOwnerAddress: string) {
    const contractAddress = this.getCatNftContractAddress();
    const provider = getEvmProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      throw new BadRequestException('Mint transaction receipt was not found');
    }
    if (receipt.status !== 1) {
      throw new BadRequestException('Mint transaction was not successful');
    }

    const expectedOwner = getAddress(expectedOwnerAddress);
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) {
        continue;
      }

      const parsed = CAT_NFT_INTERFACE.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (!parsed) continue;

      if (parsed.name === 'Minted') {
        const to = getAddress(parsed.args.to as string);
        const tokenId = parsed.args.tokenId?.toString();
        if (tokenId && to === expectedOwner) {
          return { tokenId, ownerAddress: to };
        }
      }

      if (parsed.name === 'Transfer') {
        const from = getAddress(parsed.args.from as string);
        const to = getAddress(parsed.args.to as string);
        const tokenId = parsed.args.tokenId?.toString();
        if (
          tokenId &&
          from === getAddress('0x0000000000000000000000000000000000000000') &&
          to === expectedOwner
        ) {
          return { tokenId, ownerAddress: to };
        }
      }
    }

    throw new BadRequestException('No CatNFT mint event found in transaction receipt');
  }

  private async persistMintRecord(params: {
    userId?: number | null;
    txHash: string;
    ownerAddress: string;
    tokenId?: string;
    metadataItemId?: number;
    mintedAt?: string;
    source?: string;
  }) {
    const txHash = params.txHash?.trim().toLowerCase();

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new BadRequestException('txHash is invalid');
    }

    const ownerAddress = params.ownerAddress?.trim().toLowerCase();
    if (!ownerAddress || !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
      throw new BadRequestException('ownerAddress is invalid');
    }

    const resolvedMint = params.tokenId?.trim()
      ? { tokenId: params.tokenId.trim(), ownerAddress: getAddress(ownerAddress) }
      : await this.resolveMintFromReceipt(txHash, ownerAddress);
    const tokenId = resolvedMint.tokenId;

    const contractAddress = this.getCatNftContractAddress();
    const metadataItem = await this.resolveMetadataItemForTokenId(
      tokenId,
      params.metadataItemId,
    );

    const mintRecord = await this.mintRepository
      .createQueryBuilder()
      .insert()
      .into(CatMintRecord)
      .values({
        userId: params.userId ?? null,
        ownerAddress,
        tokenId,
        txHash,
        contractAddress,
        metadataItemId: metadataItem?.id ?? null,
        source: params.source || 'frontend',
        mintedAt: params.mintedAt ? new Date(params.mintedAt) : new Date(),
        metadata: metadataItem
          ? {
              serialNo: metadataItem.serialNo,
              name: metadataItem.name,
              ...(metadataItem.image ? { image: metadataItem.image } : {}),
              ...(metadataItem.attributes ? { attributes: metadataItem.attributes } : {}),
            }
          : null,
      })
      .orIgnore()
      .returning(['id'])
      .execute();

    const inserted = Boolean((mintRecord.generatedMaps?.[0] as { id?: number } | undefined)?.id);

    if (!inserted && metadataItem) {
      await this.mintRepository.update(
        { txHash, tokenId },
        {
          metadataItemId: metadataItem.id,
          metadata: {
            serialNo: metadataItem.serialNo,
            name: metadataItem.name,
            ...(metadataItem.image ? { image: metadataItem.image } : {}),
            ...(metadataItem.attributes ? { attributes: metadataItem.attributes } : {}),
          },
        },
      );
    }

    if (metadataItem) {
      await this.metadataRepository.update(
        { id: metadataItem.id },
        {
          minted: true,
          mintedTokenId: tokenId,
          mintedTxHash: txHash,
          status: 'minted',
        },
      );
    }

    return {
      ok: true,
      inserted,
      tokenId,
      metadataItemId: metadataItem?.id ?? null,
      userId: params.userId ?? null,
    };
  }

  async getCredits(credentialId: string) {
    const user = await this.userService.ensureUserExists(credentialId);
    return {
      mintCreditsRemaining: Math.max(0, Number(user.mintCreditsRemaining || 0)),
      walletAddress: user.walletAddress,
    };
  }

  async issueMintVoucher(credentialId: string, quantity: number) {
    const normalizedQuantity = Math.max(1, Math.floor(Number(quantity || 1)));
    if (normalizedQuantity > 20) {
      throw new BadRequestException('Quantity too large');
    }

    const signerPk = process.env.CAT_NFT_VOUCHER_SIGNER_PRIVATE_KEY;
    const chainId = EVM_NETWORK.chainId;

    if (!signerPk) {
      throw new BadRequestException('CAT_NFT_VOUCHER_SIGNER_PRIVATE_KEY is not configured');
    }

    const wallet = new Wallet(signerPk);
    const contractAddress = await this.assertCatNftContractReady(wallet.address);

    const result = await this.userRepository.manager.transaction(async (manager) => {
      const txUserRepo = manager.getRepository(User);
      const txLedgerRepo = manager.getRepository(MintCreditLedger);

      const user = await txUserRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.credentialId = :credentialId', { credentialId })
        .getOne();

      if (!user) {
        throw new BadRequestException('User not found');
      }
      if (!user.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(user.walletAddress)) {
        throw new BadRequestException('User walletAddress is not set');
      }

      const currentCredits = Math.max(0, Number(user.mintCreditsRemaining || 0));
      if (currentCredits < normalizedQuantity) {
        throw new BadRequestException('Insufficient mint credits');
      }

      const nextCredits = currentCredits - normalizedQuantity;
      const nextNonce = Math.max(0, Number(user.catMintNonce || 0)) + 1;
      const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;

      user.mintCreditsRemaining = nextCredits;
      user.catMintNonce = nextNonce;
      await txUserRepo.save(user);

      await txLedgerRepo.save({
        userId: user.id,
        delta: -normalizedQuantity,
        balanceAfter: nextCredits,
        source: 'mint_voucher_issue',
        sourceRef: String(nextNonce),
        metadata: {
          quantity: normalizedQuantity,
          expiresAt,
        },
      });

      return {
        user,
        nonce: nextNonce,
        expiresAt,
        remainingCredits: nextCredits,
      };
    });

    const voucher = {
      to: result.user.walletAddress!,
      nonce: BigInt(result.nonce),
      expiresAt: result.expiresAt,
      quantity: normalizedQuantity,
    };

    const signature = await wallet.signTypedData(
      {
        name: 'CatNFT',
        version: '1',
        chainId,
        verifyingContract: contractAddress,
      },
      {
        MintVoucher: [
          { name: 'to', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiresAt', type: 'uint64' },
          { name: 'quantity', type: 'uint32' },
        ],
      },
      voucher,
    );

    return {
      voucher: {
        to: voucher.to,
        nonce: voucher.nonce.toString(),
        expiresAt: voucher.expiresAt,
        quantity: voucher.quantity,
      },
      signature,
      remainingCredits: result.remainingCredits,
      signerAddress: wallet.address,
    };
  }

  async recordMint(
    credentialId: string,
    dto: {
      tokenId?: string;
      txHash: string;
      ownerAddress: string;
      metadataItemId?: number;
      mintedAt?: string;
      source?: string;
    },
  ) {
    const user = await this.userService.ensureUserExists(credentialId);
    return this.persistMintRecord({
      userId: user.id,
      txHash: dto.txHash,
      ownerAddress: dto.ownerAddress,
      tokenId: dto.tokenId,
      metadataItemId: dto.metadataItemId,
      mintedAt: dto.mintedAt,
      source: dto.source || 'frontend',
    });
  }

  async backfillMintRecord(dto: {
    tokenId?: string;
    txHash: string;
    ownerAddress: string;
    metadataItemId?: number;
    mintedAt?: string;
    source?: string;
  }) {
    const ownerAddress = dto.ownerAddress?.trim().toLowerCase();
    const user = ownerAddress
      ? await this.userRepository
          .createQueryBuilder('user')
          .where('lower(user.walletAddress) = :walletAddress', {
            walletAddress: ownerAddress,
          })
          .getOne()
      : null;

    return this.persistMintRecord({
      userId: user?.id ?? null,
      txHash: dto.txHash,
      ownerAddress: dto.ownerAddress,
      tokenId: dto.tokenId,
      metadataItemId: dto.metadataItemId,
      mintedAt: dto.mintedAt,
      source: dto.source || 'admin-backfill',
    });
  }

  async getBatches() {
    const rows = await this.batchRepository.find({
      order: { id: 'DESC' },
      take: 100,
    });
    return { items: rows };
  }

  async createBatch(dto: {
    name: string;
    metadataCid: string;
    imageCid?: string;
    totalItems?: number;
    status?: string;
  }) {
    const metadataCid = dto.metadataCid?.trim();
    if (!metadataCid) {
      throw new BadRequestException('metadataCid is required');
    }

    const baseURI = `ipfs://${metadataCid.replace(/^ipfs:\/\//, '')}/`;
    const row = await this.batchRepository.save({
      name: dto.name?.trim() || `batch-${Date.now()}`,
      metadataCid: metadataCid.replace(/^ipfs:\/\//, ''),
      imageCid: dto.imageCid?.trim() || null,
      baseURI,
      totalItems: Math.max(0, Number(dto.totalItems || 0)),
      status: dto.status?.trim() || 'active',
      metadata: null,
    });
    return { item: row };
  }

  async upsertMetadataItems(dto: {
    batchId: number;
    items: Array<{
      serialNo: number;
      name: string;
      description?: string;
      image?: string;
      attributes?: Array<Record<string, unknown>>;
      metadata?: Record<string, unknown>;
    }>;
  }) {
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('items is required');
    }

    const saved: CatMetadataItem[] = [];
    for (const item of dto.items) {
      const serialNo = Math.max(1, Math.floor(Number(item.serialNo || 0)));
      const existing = await this.metadataRepository.findOne({
        where: { batchId: dto.batchId, serialNo },
      });

      const payload: Partial<CatMetadataItem> = {
        batchId: dto.batchId,
        serialNo,
        name: item.name?.trim() || `Cat #${serialNo}`,
        description: item.description?.trim() || null,
        image: item.image?.trim() || null,
        attributes: item.attributes || null,
        metadata: item.metadata || null,
      };

      if (existing) {
        const updated = await this.metadataRepository.save({
          ...existing,
          ...payload,
        });
        saved.push(updated);
      } else {
        const created = await this.metadataRepository.save({
          ...payload,
          status: 'ready',
          minted: false,
        } as CatMetadataItem);
        saved.push(created);
      }
    }

    return {
      ok: true,
      count: saved.length,
      items: saved,
    };
  }

  async getMetadataItems(batchId?: number, page = 1, limit = 50) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));

    const query = this.metadataRepository
      .createQueryBuilder('item')
      .orderBy('item.serialNo', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    if (Number.isFinite(Number(batchId)) && Number(batchId) > 0) {
      query.where('item.batchId = :batchId', { batchId: Number(batchId) });
    }

    const [items, total] = await query.getManyAndCount();
    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getMints(page = 1, limit = 30) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));

    const [items, total] = await this.mintRepository.findAndCount({
      order: { id: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Upload an image and metadata to Pinata and return the IPFS metadata URL (ipfs://...)
   */
  async uploadMetadata(name: string, description: string | undefined, imageBase64: string) {
    // Normalize base64: allow data URLs
    let base64 = imageBase64;
    const dataUrlMatch = imageBase64.match(/^data:(.+);base64,(.*)$/);
    let mime = 'application/octet-stream';
    if (dataUrlMatch) {
      mime = dataUrlMatch[1];
      base64 = dataUrlMatch[2];
    }

    const buffer = Buffer.from(base64, 'base64');
    const ext = mime.split('/')[1] ?? 'bin';
    const filename = `image.${ext}`;

    const imageCid = await this.pinFileToIpfs(filename, buffer, mime);

    const metadata = {
      name,
      description,
      image: `ipfs://${imageCid}`,
    };

    this.logger.log(`Storing metadata for ${name} (file ${filename}) to Pinata`);
    const metadataCid = await this.pinJsonToIpfs(metadata);

    // metadata.url looks like ipfs://bafy.../metadata.json
    return {
      imageCid,
      metadataCid,
      url: `ipfs://${metadataCid}`,
      data: metadata,
    };
  }
}
