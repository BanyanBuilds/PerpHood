// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LeverageXPerpsMarketRegistryV76} from "../perps-registry-src/LeverageXPerpsMarketRegistryV76.sol";

interface VmDeployV76 {
    function envUint(string calldata name) external view returns (uint256 value);
    function envAddress(string calldata name) external view returns (address value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployLeverageXPerpsRegistryV76 {
    VmDeployV76 private constant vm = VmDeployV76(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant RH_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address private constant RH_UNISWAP_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;

    event PerpsRegistryDeployed(address indexed owner, address indexed launchFactory, address indexed registry);

    function run() external returns (LeverageXPerpsMarketRegistryV76 registry) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("LEVERAGEX_OWNER");
        address launchFactory = vm.envAddress("LEVERAGEX_LAUNCH_FACTORY");
        vm.startBroadcast(deployerKey);
        registry = new LeverageXPerpsMarketRegistryV76(owner, launchFactory, RH_UNISWAP_V3_FACTORY, RH_WETH);
        vm.stopBroadcast();
        emit PerpsRegistryDeployed(owner, launchFactory, address(registry));
    }
}
