// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILeverageXPerpsRegistryV79 {
    function requireTradable(address token, address wallet, uint16 requestedLeverageX) external view;
}
interface ILeverageXMarkPriceOracleV79 {
    function markPriceWad(address token) external view returns (uint256 priceWad, uint64 updatedAt);
}

/// @title LeverageXSolvencyPositionEngineV79
/// @notice Isolated-margin ETH perps engine with insurance reserves, per-market OI caps and solvency gates.
/// @dev One position per wallet/market. No funding or cross-margin. Public deployment requires an independent audit.
contract LeverageXSolvencyPositionEngineV79 {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_LEVERAGE_X = 20;

    enum Side { NONE, LONG, SHORT }
    struct Position { Side side; uint16 leverageX; uint64 openedAt; uint256 collateralWei; uint256 notionalWei; uint256 entryPriceWad; }
    struct MarketRisk {
        uint16 maintenanceMarginBps;
        uint16 openFeeBps;
        uint16 closeFeeBps;
        uint16 insuranceFeeShareBps;
        uint16 maxSkewBps;
        uint32 maxOracleAgeSeconds;
        uint256 maxLongOiWei;
        uint256 maxShortOiWei;
        uint256 maxTotalOiWei;
        uint256 minInsuranceWei;
        bool enabled;
    }

    address public owner;
    address public pendingOwner;
    address public feeRecipient;
    ILeverageXPerpsRegistryV79 public immutable registry;
    ILeverageXMarkPriceOracleV79 public oracle;
    uint256 private entered;

    uint256 public totalUserCollateralWei;
    uint256 public protocolFeesWei;
    uint256 public insuranceReserveWei;
    uint256 public totalLockedMarginWei;
    uint256 public totalPotentialProfitLiabilityWei;

    mapping(address => uint256) public freeCollateralWei;
    mapping(address => mapping(address => Position)) private positions;
    mapping(address => MarketRisk) public marketRisk;
    mapping(address => uint256) public longOpenInterestWei;
    mapping(address => uint256) public shortOpenInterestWei;
    mapping(address => uint256) public marketInsuranceWei;
    mapping(address => bool) public liquidator;

    event InsuranceFunded(address indexed sender, address indexed token, uint256 amountWei);
    event InsuranceWithdrawn(address indexed token, address indexed recipient, uint256 amountWei);
    event MarketRiskSet(address indexed token, MarketRisk risk);
    event PositionOpened(address indexed account,address indexed token,Side side,uint16 leverageX,uint256 collateralWei,uint256 notionalWei,uint256 entryPriceWad,uint256 feeWei);
    event PositionClosed(address indexed account,address indexed token,uint256 exitPriceWad,int256 pnlWei,uint256 payoutWei,uint256 feeWei,uint256 insuranceUsedWei);
    event PositionLiquidated(address indexed account,address indexed token,address indexed keeper,uint256 markPriceWad,int256 pnlWei,uint256 remainingWei);
    event CollateralDeposited(address indexed account,uint256 amountWei);
    event CollateralWithdrawn(address indexed account,uint256 amountWei);
    event SolvencyCheckpoint(uint256 assetsWei,uint256 protectedLiabilitiesWei,uint256 freeSurplusWei);

    error OnlyOwner(); error OnlyLiquidator(); error Reentrancy(); error InvalidAddress(); error InvalidAmount();
    error InvalidRisk(); error MarketDisabled(); error PositionExists(); error PositionMissing(); error InsufficientCollateral();
    error OracleStale(); error OracleInvalid(); error OpenInterestCap(); error SkewCap(); error InsuranceFloor();
    error Insolvent(); error NotLiquidatable(); error TransferFailed();

    modifier onlyOwner(){ if(msg.sender!=owner) revert OnlyOwner(); _; }
    modifier nonReentrant(){ if(entered!=0) revert Reentrancy(); entered=1; _; entered=0; }

    constructor(address owner_,address registry_,address oracle_,address feeRecipient_){
        if(owner_==address(0)||registry_==address(0)||oracle_==address(0)||feeRecipient_==address(0)) revert InvalidAddress();
        owner=owner_; registry=ILeverageXPerpsRegistryV79(registry_); oracle=ILeverageXMarkPriceOracleV79(oracle_); feeRecipient=feeRecipient_;
    }
    receive() external payable { revert InvalidAmount(); }

    function beginOwnershipTransfer(address next) external onlyOwner { if(next==address(0)) revert InvalidAddress(); pendingOwner=next; }
    function acceptOwnership() external { if(msg.sender!=pendingOwner) revert OnlyOwner(); owner=msg.sender; pendingOwner=address(0); }
    function setOracle(address next) external onlyOwner { if(next==address(0)) revert InvalidAddress(); oracle=ILeverageXMarkPriceOracleV79(next); }
    function setLiquidator(address account,bool allowed) external onlyOwner { if(account==address(0)) revert InvalidAddress(); liquidator[account]=allowed; }

    function setMarketRisk(address token,MarketRisk calldata r) external onlyOwner {
        if(token==address(0)||r.maintenanceMarginBps==0||r.maintenanceMarginBps>=BPS||r.openFeeBps>500||r.closeFeeBps>500) revert InvalidRisk();
        if(r.insuranceFeeShareBps>BPS||r.maxSkewBps>BPS||r.maxOracleAgeSeconds==0||r.maxLongOiWei==0||r.maxShortOiWei==0||r.maxTotalOiWei==0) revert InvalidRisk();
        if(r.maxTotalOiWei>r.maxLongOiWei+r.maxShortOiWei) revert InvalidRisk();
        marketRisk[token]=r; emit MarketRiskSet(token,r);
    }

    function fundInsurance(address token) external payable nonReentrant {
        if(msg.value==0) revert InvalidAmount(); insuranceReserveWei+=msg.value; marketInsuranceWei[token]+=msg.value;
        emit InsuranceFunded(msg.sender,token,msg.value); _emitCheckpoint();
    }
    function withdrawInsuranceSurplus(address token,uint256 amountWei,address payable recipient) external onlyOwner nonReentrant {
        if(recipient==address(0)||amountWei==0||marketInsuranceWei[token]<amountWei) revert InvalidAmount();
        MarketRisk memory r=marketRisk[token]; if(marketInsuranceWei[token]-amountWei<r.minInsuranceWei) revert InsuranceFloor();
        if(freeSurplusWei()<amountWei) revert Insolvent();
        marketInsuranceWei[token]-=amountWei; insuranceReserveWei-=amountWei; _send(recipient,amountWei);
        emit InsuranceWithdrawn(token,recipient,amountWei); _emitCheckpoint();
    }

    function depositCollateral() external payable nonReentrant { if(msg.value==0) revert InvalidAmount(); freeCollateralWei[msg.sender]+=msg.value; totalUserCollateralWei+=msg.value; emit CollateralDeposited(msg.sender,msg.value); }
    function withdrawCollateral(uint256 amountWei) external nonReentrant {
        if(amountWei==0||freeCollateralWei[msg.sender]<amountWei) revert InsufficientCollateral();
        freeCollateralWei[msg.sender]-=amountWei; totalUserCollateralWei-=amountWei; _send(payable(msg.sender),amountWei); emit CollateralWithdrawn(msg.sender,amountWei);
    }

    function openPosition(address token,Side side,uint16 leverageX,uint256 collateralWei) external nonReentrant {
        if(side==Side.NONE||leverageX==0||leverageX>MAX_LEVERAGE_X||collateralWei==0) revert InvalidAmount();
        if(positions[msg.sender][token].side!=Side.NONE) revert PositionExists();
        registry.requireTradable(token,msg.sender,leverageX);
        MarketRisk memory r=marketRisk[token]; if(!r.enabled) revert MarketDisabled();
        if(marketInsuranceWei[token]<r.minInsuranceWei) revert InsuranceFloor();
        uint256 notional=collateralWei*leverageX; uint256 fee=_mulDiv(notional,r.openFeeBps,BPS);
        if(freeCollateralWei[msg.sender]<collateralWei+fee) revert InsufficientCollateral();
        uint256 nextLong=longOpenInterestWei[token]+(side==Side.LONG?notional:0);
        uint256 nextShort=shortOpenInterestWei[token]+(side==Side.SHORT?notional:0);
        if(nextLong>r.maxLongOiWei||nextShort>r.maxShortOiWei||nextLong+nextShort>r.maxTotalOiWei) revert OpenInterestCap();
        uint256 larger=nextLong>nextShort?nextLong:nextShort; uint256 total=nextLong+nextShort;
        if(total>0&&_mulDiv(larger-(total-larger),BPS,total)>r.maxSkewBps) revert SkewCap();
        (uint256 price,)=_freshPrice(token,r.maxOracleAgeSeconds);
        freeCollateralWei[msg.sender]-=collateralWei+fee; totalLockedMarginWei+=collateralWei;
        uint256 insuranceCut=_mulDiv(fee,r.insuranceFeeShareBps,BPS); marketInsuranceWei[token]+=insuranceCut; insuranceReserveWei+=insuranceCut; protocolFeesWei+=fee-insuranceCut;
        positions[msg.sender][token]=Position(side,leverageX,uint64(block.timestamp),collateralWei,notional,price);
        longOpenInterestWei[token]=nextLong; shortOpenInterestWei[token]=nextShort;
        totalPotentialProfitLiabilityWei+=notional;
        if(protectedLiabilitiesWei()>address(this).balance) revert Insolvent();
        emit PositionOpened(msg.sender,token,side,leverageX,collateralWei,notional,price,fee); _emitCheckpoint();
    }

    function closePosition(address token) external nonReentrant {
        Position memory p=positions[msg.sender][token]; if(p.side==Side.NONE) revert PositionMissing(); MarketRisk memory r=marketRisk[token];
        (uint256 price,)=_freshPrice(token,r.maxOracleAgeSeconds); int256 pnl=_pnl(p,price); uint256 gross=pnl>=0?p.collateralWei+uint256(pnl):(uint256(-pnl)>=p.collateralWei?0:p.collateralWei-uint256(-pnl));
        uint256 fee=_mulDiv(p.notionalWei,r.closeFeeBps,BPS); uint256 payout=gross>fee?gross-fee:0; uint256 insuranceUsed;
        _clear(msg.sender,token,p); uint256 insuranceCut=_mulDiv(fee,r.insuranceFeeShareBps,BPS); marketInsuranceWei[token]+=insuranceCut; insuranceReserveWei+=insuranceCut; protocolFeesWei+=fee-insuranceCut;
        uint256 nonUserAssets=address(this).balance-(totalUserCollateralWei-p.collateralWei);
        if(payout>p.collateralWei&&payout-p.collateralWei>nonUserAssets) revert Insolvent();
        if(payout>p.collateralWei){ insuranceUsed=payout-p.collateralWei; uint256 useMarket=insuranceUsed>marketInsuranceWei[token]?marketInsuranceWei[token]:insuranceUsed; marketInsuranceWei[token]-=useMarket; insuranceReserveWei-=useMarket; }
        freeCollateralWei[msg.sender]+=payout; totalUserCollateralWei=totalUserCollateralWei-p.collateralWei+payout;
        emit PositionClosed(msg.sender,token,price,pnl,payout,fee,insuranceUsed); _emitCheckpoint();
    }

    function liquidate(address account,address token) external nonReentrant {
        if(msg.sender!=owner&&!liquidator[msg.sender]) revert OnlyLiquidator(); Position memory p=positions[account][token]; if(p.side==Side.NONE) revert PositionMissing();
        MarketRisk memory r=marketRisk[token]; (uint256 price,)=_freshPrice(token,r.maxOracleAgeSeconds); (int256 pnl,uint256 equity)=positionEquity(p,price);
        if(_mulDiv(equity,BPS,p.notionalWei)>r.maintenanceMarginBps) revert NotLiquidatable();
        _clear(account,token,p); freeCollateralWei[account]+=equity; totalUserCollateralWei=totalUserCollateralWei-p.collateralWei+equity;
        emit PositionLiquidated(account,token,msg.sender,price,pnl,equity); _emitCheckpoint();
    }

    function position(address account,address token) external view returns(Position memory){ return positions[account][token]; }
    function protectedLiabilitiesWei() public view returns(uint256){ return totalUserCollateralWei+protocolFeesWei; }
    function freeSurplusWei() public view returns(uint256){ uint256 p=protectedLiabilitiesWei(); return address(this).balance>p?address(this).balance-p:0; }
    function solvencyRatioBps() external view returns(uint256){ uint256 p=protectedLiabilitiesWei(); return p==0?type(uint256).max:_mulDiv(address(this).balance,BPS,p); }
    function isLiquidatable(address account,address token) external view returns(bool){ Position memory p=positions[account][token]; if(p.side==Side.NONE) return false; MarketRisk memory r=marketRisk[token]; (uint256 price,)=_freshPrice(token,r.maxOracleAgeSeconds); (,uint256 equity)=positionEquity(p,price); return _mulDiv(equity,BPS,p.notionalWei)<=r.maintenanceMarginBps; }
    function positionEquity(Position memory p,uint256 price) public pure returns(int256 pnl,uint256 equity){ pnl=_pnl(p,price); equity=pnl>=0?p.collateralWei+uint256(pnl):(uint256(-pnl)>=p.collateralWei?0:p.collateralWei-uint256(-pnl)); }

    function _clear(address account,address token,Position memory p) internal { delete positions[account][token]; totalLockedMarginWei-=p.collateralWei; totalPotentialProfitLiabilityWei-=p.notionalWei; if(p.side==Side.LONG) longOpenInterestWei[token]-=p.notionalWei; else shortOpenInterestWei[token]-=p.notionalWei; }
    function _pnl(Position memory p,uint256 price) internal pure returns(int256){ if(price==p.entryPriceWad) return 0; if(p.side==Side.LONG) return int256(_mulDiv(p.notionalWei,price,p.entryPriceWad))-int256(p.notionalWei); return int256(p.notionalWei)-int256(_mulDiv(p.notionalWei,price,p.entryPriceWad)); }
    function _freshPrice(address token,uint32 maxAge) internal view returns(uint256 price,uint64 updatedAt){ (price,updatedAt)=oracle.markPriceWad(token); if(price==0) revert OracleInvalid(); if(updatedAt>block.timestamp||block.timestamp-updatedAt>maxAge) revert OracleStale(); }
    function _send(address payable to,uint256 amount) internal { (bool ok,)=to.call{value:amount}(""); if(!ok) revert TransferFailed(); }
    function _emitCheckpoint() internal { uint256 p=protectedLiabilitiesWei(); emit SolvencyCheckpoint(address(this).balance,p,address(this).balance>p?address(this).balance-p:0); }
    function _mulDiv(uint256 x,uint256 y,uint256 d) internal pure returns(uint256){ return x*y/d; }
}
