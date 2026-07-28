// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    LeverageXPermanentLiquidityLockerV65,
    LeverageXLaunchFactoryV65
} from "../mint-path-src/LeverageXLaunchFactoryV70.sol";

interface VmV72 {
    function envUint(string calldata name) external view returns (uint256 value);
    function envAddress(string calldata name) external view returns (address value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployLeverageXMintPathV72 {
    VmV72 private constant vm = VmV72(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address private constant RH_UNISWAP_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address private constant RH_POSITION_MANAGER = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;
    address private constant RH_SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;

    event MintPathDeployed(address indexed owner, address indexed locker, address indexed factory);

    function run() external returns (LeverageXPermanentLiquidityLockerV65 locker, LeverageXLaunchFactoryV65 factory) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("LEVERAGEX_OWNER");

        vm.startBroadcast(deployerKey);
        locker = new LeverageXPermanentLiquidityLockerV65(
            owner,
            RH_UNISWAP_V3_FACTORY,
            RH_POSITION_MANAGER,
            RH_WETH
        );
        factory = new LeverageXLaunchFactoryV65(
            owner,
            RH_UNISWAP_V3_FACTORY,
            RH_POSITION_MANAGER,
            RH_SWAP_ROUTER_02,
            RH_WETH,
            address(locker)
        );
        locker.bindFactory(address(factory));
        vm.stopBroadcast();

        emit MintPathDeployed(owner, address(locker), address(factory));
    }
}
