pragma solidity =0.5.16;

import './interfaces/IUniswapV2Pair.sol';
import './UniswapV2ERC20.sol';
import './libraries/Math.sol';
import './libraries/UQ112x112.sol';
import './interfaces/IERC20.sol';
import './interfaces/IUniswapV2Factory.sol';
import './interfaces/IUniswapV2Callee.sol';

contract UniswapV2Pair is IUniswapV2Pair, UniswapV2ERC20 {
    using SafeMath  for uint;
    using UQ112x112 for uint224;

    uint public constant MINIMUM_LIQUIDITY = 10**3;
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

    address public factory;
    address public token;

    uint112 private reserve;            // uses single storage slot, accessible via getReserves

    uint public kLast; // reserve, as of immediately after the most recent liquidity event

    uint private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'UniswapV2: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function getReserves() public view returns (uint112 _reserve) {
        _reserve = reserve;
    }

    function _safeTransfer(address _token, address to, uint value) private {
        (bool success, bytes memory data) = _token.call(abi.encodeWithSelector(SELECTOR, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'UniswapV2: TRANSFER_FAILED');
    }

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve);

    constructor() public {
        factory = msg.sender;
    }

    // called once by the factory at time of deployment
    function initialize(address _token) external {
        require(msg.sender == factory, 'UniswapV2: FORBIDDEN'); // sufficient check
        token = _token;
    }

    // update reserves and, on the first call per block, price accumulators
    function _update(uint balance) private {
        require(balance <= uint112(-1), 'UniswapV2: OVERFLOW');
        reserve = uint112(balance);
        emit Sync(reserve);
    }

    // if fee is on, mint liquidity equivalent to 1/6th of the growth in sqrt(k)
    function _mintFee(uint112 _reserve) private returns (bool feeOn) {
        address feeTo = IUniswapV2Factory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint _kLast = kLast; // gas savings
        if (feeOn) {
            if (_kLast != 0) {
                uint rootK = _reserve;
                uint rootKLast = _kLast;
                if (rootK > rootKLast) {
                    uint numerator = totalSupply.mul(rootK.sub(rootKLast));
                    uint denominator = rootK.mul(5).add(rootKLast);
                    uint liquidity = numerator / denominator;
                    if (liquidity > 0) _mint(feeTo, liquidity);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }

    // this low-level function should be called from a contract which performs important safety checks
    function mint(address to) external lock returns (uint liquidity) {
        uint112 _reserve = getReserves(); // gas savings
        uint balance = IERC20(token).balanceOf(address(this));
        uint amount = balance.sub(_reserve);

        bool feeOn = _mintFee(_reserve);
        uint _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        if (_totalSupply == 0) {
            liquidity = amount.sub(MINIMUM_LIQUIDITY);
           _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = amount.mul(_totalSupply) / reserve;
        }
        require(liquidity > 0, 'UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED');
        _mint(to, liquidity);

        _update(balance);
        if (feeOn) kLast = reserve; // reserve is up-to-date
        emit Mint(msg.sender, amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function burn(address to) external lock returns (uint amount) {
        uint112 _reserve = getReserves(); // gas savings
        address _token = token;                                 // gas savings
        uint balance = IERC20(_token).balanceOf(address(this));
        uint liquidity = balanceOf[address(this)];

        bool feeOn = _mintFee(_reserve);
        uint _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        amount = liquidity.mul(balance) / _totalSupply; // using balances ensures pro-rata distribution
        require(amount > 0, 'UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED');
        _burn(address(this), liquidity);
        _safeTransfer(_token, to, amount);
        balance = IERC20(_token).balanceOf(address(this));

        _update(balance);
        if (feeOn) kLast = reserve; // reserve is up-to-date
        emit Burn(msg.sender, amount, to);
    }

    // force balances to match reserves
    function skim(address to) external lock {
        address _token = token; // gas savings
        _safeTransfer(_token, to, IERC20(_token).balanceOf(address(this)).sub(reserve));
    }

    // force reserves to match balances
    function sync() external lock {
        _update(IERC20(token).balanceOf(address(this)));
    }
}
