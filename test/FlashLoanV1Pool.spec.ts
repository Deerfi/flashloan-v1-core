import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify, defaultAbiCoder } from 'ethers/utils'

import { expandTo18Decimals, mineBlock } from './shared/utilities'
import { poolFixture } from './shared/fixtures'
import { AddressZero } from 'ethers/constants'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('FlashLoanV1Pool', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let factory: Contract
  let token: Contract
  let pool: Contract
  let receiver: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(poolFixture)
    factory = fixture.factory
    token = fixture.token
    pool = fixture.pool
    receiver = fixture.receiver
  })

  it('mint', async () => {
    const tokenAmount = expandTo18Decimals(1)
    await token.transfer(pool.address, tokenAmount)

    const expectedLiquidity = expandTo18Decimals(1)
    await expect(pool.mint(wallet.address, overrides))
      .to.emit(pool, 'Transfer')
      .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pool, 'Transfer')
      .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(pool, 'Sync')
      .withArgs(tokenAmount)
      .to.emit(pool, 'Mint')
      .withArgs(wallet.address, tokenAmount)

    expect(await pool.totalSupply()).to.eq(expectedLiquidity)
    expect(await pool.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(await token.balanceOf(pool.address)).to.eq(tokenAmount)
    const reserve = await pool.reserve()
    expect(reserve).to.eq(tokenAmount)
  })

  async function addLiquidity(tokenAmount: BigNumber) {
    await token.transfer(pool.address, tokenAmount)
    await pool.mint(wallet.address, overrides)
  }

  it('flashLoan', async () => {
    const loanAmount = expandTo18Decimals(10000)

    const data = defaultAbiCoder.encode(
      ['address'],
      [pool.address]
    )
    const premiumAmount = expandTo18Decimals(5)
    await token.transfer(receiver.address, premiumAmount)
    await token.transfer(pool.address, loanAmount)

    await expect(pool.flashLoan(receiver.address, loanAmount, data))
      .to.emit(token, 'Transfer')
      .withArgs(pool.address, receiver.address, loanAmount)
      .to.emit(token, 'Transfer')
      .withArgs(receiver.address, pool.address, loanAmount.add(premiumAmount))
      .to.emit(pool, 'Sync')
      .withArgs(loanAmount.add(premiumAmount))
      .to.emit(pool, 'FlashLoan')
      .withArgs(receiver.address, wallet.address, token.address, loanAmount, premiumAmount)

      const reserve = await pool.reserve()
      expect(reserve).to.eq(loanAmount.add(premiumAmount))
      expect(await token.balanceOf(pool.address)).to.eq(loanAmount.add(premiumAmount))
      expect(await token.balanceOf(receiver.address)).to.eq(0)
      const totalSupplyToken = await token.totalSupply()
      expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(loanAmount).sub(premiumAmount))
  })

  it('flashLoan: executeFlashLoan', async () => {
    const loanAmount = expandTo18Decimals(10000)

    const premiumAmount = expandTo18Decimals(5)
    await token.transfer(receiver.address, premiumAmount)
    await token.transfer(pool.address, loanAmount)

    await expect(receiver.executeFlashLoan(pool.address, loanAmount))
      .to.emit(token, 'Transfer')
      .withArgs(pool.address, receiver.address, loanAmount)
      .to.emit(token, 'Transfer')
      .withArgs(receiver.address, pool.address, loanAmount.add(premiumAmount))
      .to.emit(pool, 'Sync')
      .withArgs(loanAmount.add(premiumAmount))
      .to.emit(pool, 'FlashLoan')
      .withArgs(receiver.address, receiver.address, token.address, loanAmount, premiumAmount)

      const reserve = await pool.reserve()
      expect(reserve).to.eq(loanAmount.add(premiumAmount))
      expect(await token.balanceOf(pool.address)).to.eq(loanAmount.add(premiumAmount))
      expect(await token.balanceOf(receiver.address)).to.eq(0)
      const totalSupplyToken = await token.totalSupply()
      expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(loanAmount).sub(premiumAmount))
  })

  it('flashloan:gas', async () => {
    const loanAmount = expandTo18Decimals(10000)
    const premiumAmount = expandTo18Decimals(5)

    // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    await pool.sync(overrides)

    const data = defaultAbiCoder.encode(
      ['address'],
      [pool.address]
    )

    await token.transfer(pool.address, loanAmount)
    await token.transfer(receiver.address, premiumAmount)
    await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
    const tx = await pool.flashLoan(receiver.address, loanAmount, data)
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(69776)
  })

  it('burn', async () => {
    const tokenAmount = expandTo18Decimals(3)
    await addLiquidity(tokenAmount)

    const expectedLiquidity = expandTo18Decimals(3)
    await pool.transfer(pool.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await expect(pool.burn(wallet.address, overrides))
      .to.emit(pool, 'Transfer')
      .withArgs(pool.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(token, 'Transfer')
      .withArgs(pool.address, wallet.address, tokenAmount.sub(1000))
      .to.emit(pool, 'Sync')
      .withArgs(1000)
      .to.emit(pool, 'Burn')
      .withArgs(wallet.address, tokenAmount.sub(1000), wallet.address)

    expect(await pool.balanceOf(wallet.address)).to.eq(0)
    expect(await pool.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
    expect(await token.balanceOf(pool.address)).to.eq(1000)
    const totalSupplyToken = await token.totalSupply()
    expect(await token.balanceOf(wallet.address)).to.eq(totalSupplyToken.sub(1000))
  })

  it('feeTo:off', async () => {
    const tokenAmount = expandTo18Decimals(1000)
    await addLiquidity(tokenAmount)

    const data = defaultAbiCoder.encode(
      ['address'],
      [pool.address]
    )
    const loanAmount = expandTo18Decimals(1)
    const premiumAmount = bigNumberify('500000000000000')
    await token.transfer(receiver.address, premiumAmount)
    await token.transfer(pool.address, loanAmount)
    await pool.flashLoan(receiver.address, loanAmount, data)

    const expectedLiquidity = expandTo18Decimals(1000)
    await pool.transfer(pool.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pool.burn(wallet.address, overrides)
    expect(await pool.totalSupply()).to.eq(MINIMUM_LIQUIDITY)
  })

  it('feeTo:on', async () => {
    await factory.setFeeTo(other.address)

    const tokenAmount = expandTo18Decimals(1000)
    await addLiquidity(tokenAmount)

    const data = defaultAbiCoder.encode(
      ['address'],
      [pool.address]
    )
    const loanAmount = expandTo18Decimals(1)
    const premiumAmount = bigNumberify('500000000000000')
    await token.transfer(receiver.address, premiumAmount)
    await token.transfer(pool.address, loanAmount)
    await pool.flashLoan(receiver.address, loanAmount, data)

    const expectedLiquidity = expandTo18Decimals(1000)
    await pool.transfer(pool.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pool.burn(wallet.address, overrides)
    expect(await pool.totalSupply()).to.eq(MINIMUM_LIQUIDITY.add('166611088005375518'))
    expect(await pool.balanceOf(other.address)).to.eq('166611088005375518')

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    expect(await token.balanceOf(pool.address)).to.eq(bigNumberify(1000).add('166750000000000001'))
  })
})
