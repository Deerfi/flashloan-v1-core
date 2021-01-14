pragma solidity =0.5.16;

import '../libraries/SafeMath.sol';
import '../interfaces/IERC20.sol';
import '../interfaces/IFlashLoanReceiver.sol';
import '../interfaces/IFlashLoanV1Pool.sol';

contract FlashLoanReceiver is IFlashLoanReceiver {
    using SafeMath for uint;

    function executeFlashLoan(address pool, uint amount) external {
        IFlashLoanV1Pool(pool).flashLoan(address(this), amount, abi.encode(pool));
    }

    function executeOperation(
        address asset,
        uint amount,
        uint premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        initiator;

        address pool = abi.decode(params, (address));
        IERC20(asset).transfer(pool, amount.add(premium));
    }
}
