import { Contract, Wallet } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import ERC20 from '../../build/ERC20.json'
import FlashLoanReceiver from '../../build/FlashLoanReceiver.json'
import FlashLoanV1Factory from '../../build/FlashLoanV1Factory.json'
import FlashLoanV1Pool from '../../build/FlashLoanV1Pool.json'

interface FactoryFixture {
  factory: Contract
}

const overrides = {
  gasLimit: 9999999
}

export async function factoryFixture(_: Web3Provider, [wallet]: Wallet[]): Promise<FactoryFixture> {
  const factory = await deployContract(wallet, FlashLoanV1Factory, [wallet.address], overrides)
  return { factory }
}

interface PoolFixture extends FactoryFixture {
  factory: Contract
  token: Contract
  pool: Contract
  receiver: Contract
}

export async function poolFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<PoolFixture> {
  const { factory } = await factoryFixture(provider, [wallet])

  const token = await deployContract(wallet, ERC20, [expandTo18Decimals(10005)], overrides)
  const receiver = await deployContract(wallet, FlashLoanReceiver)

  await factory.createPool(token.address, overrides)
  const poolAddress = await factory.getPool(token.address)
  const pool = new Contract(poolAddress, JSON.stringify(FlashLoanV1Pool.abi), provider).connect(wallet)

  return { factory, token, pool, receiver }
}
