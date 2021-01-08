pragma solidity >=0.5.0;

interface IUniswapV2Factory {
    event PairCreated(address indexed token, address pair, uint);

    function feeInBips() external view returns (uint);
    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);

    function getPair(address token) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address token) external returns (address pair);

    function setFeeTo(address) external;
    function setFeeToSetter(address) external;
}
