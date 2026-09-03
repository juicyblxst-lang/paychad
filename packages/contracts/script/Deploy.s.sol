// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayChadPayroll} from "../src/PayChadPayroll.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract Deploy {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (PayChadPayroll payroll) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        vm.startBroadcast();
        payroll = new PayChadPayroll(usdc);
        vm.stopBroadcast();
    }
}
