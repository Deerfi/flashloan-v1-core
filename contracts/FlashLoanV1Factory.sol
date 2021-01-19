pragma solidity =0.5.16;

import './interfaces/IFlashLoanV1Factory.sol';
import './FlashLoanV1Pool.sol';

contract FlashLoanV1Factory is IFlashLoanV1Factory {
    uint public feeInBips = 5;
    address public feeTo;
    address public feeToSetter;

    mapping(address => address) public getPool;
    address[] public allPools;

    event PoolCreated(address indexed token, address pool, uint);

    constructor(address _feeToSetter) public {
        feeToSetter = _feeToSetter;
    }

    function allPoolsLength() external view returns (uint) {
        return allPools.length;
    }

    function createPool(address token) external returns (address pool) {
        require(token != address(0), 'FlashLoanV1: ZERO_ADDRESS');
        require(getPool[token] == address(0), 'FlashLoanV1: POOL_EXISTS'); // single check is sufficient
        bytes memory bytecode = type(FlashLoanV1Pool).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token));
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IFlashLoanV1Pool(pool).initialize(token);
        getPool[token] = pool;
        allPools.push(pool);
        emit PoolCreated(token, pool, allPools.length);
    }

    function setFeeInBips(uint _feeInBips) external {
        require(msg.sender == feeToSetter, 'FlashLoanV1: FORBIDDEN');
        require(_feeInBips > 0 && _feeInBips < 100, 'FlashLoanV1: INVALID_VALUE');
        feeInBips = _feeInBips;
    }

    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, 'FlashLoanV1: FORBIDDEN');
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, 'FlashLoanV1: FORBIDDEN');
        feeToSetter = _feeToSetter;
    }
}
