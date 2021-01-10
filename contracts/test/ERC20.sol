pragma solidity =0.5.16;

import '../FlashLoanV1ERC20.sol';

contract ERC20 is FlashLoanV1ERC20 {
    constructor(uint _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
