export const chanceManagerAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'buyer', type: 'address' },
      { indexed: true, internalType: 'uint8', name: 'planId', type: 'uint8' },
      { indexed: false, internalType: 'uint32', name: 'chances', type: 'uint32' },
      { indexed: false, internalType: 'uint256', name: 'priceWei', type: 'uint256' },
      { indexed: false, internalType: 'uint64', name: 'cooldownEndsAt', type: 'uint64' },
      { indexed: true, internalType: 'bytes32', name: 'clientRef', type: 'bytes32' },
    ],
    name: 'ChancePurchased',
    type: 'event',
  },
] as const;
