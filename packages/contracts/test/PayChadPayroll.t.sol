// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayChadPayroll} from "../src/PayChadPayroll.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract UnauthorizedCaller {
    function addEmployee(PayChadPayroll payroll, uint256 companyId, address wallet, uint256 salary) external {
        payroll.addEmployee(companyId, wallet, salary);
    }
}

contract PayChadPayrollTest {
    MockUSDC internal token;
    PayChadPayroll internal payroll;
    address internal employee = address(0xBEEF);
    address internal employeeTwo = address(0xCAFE);

    function setUp() public {
        token = new MockUSDC();
        payroll = new PayChadPayroll(address(token));
        token.mint(address(this), 1_000e6);
    }

    function testRegisterCompanyAndEmployee() public {
        uint256 companyId = payroll.registerCompany("PayChad Demo");
        uint256 employeeId = payroll.addEmployee(companyId, employee, 250e6);
        PayChadPayroll.Employee memory stored = payroll.getEmployee(companyId, employeeId);
        require(stored.wallet == employee, "wallet");
        require(stored.salary == 250e6, "salary");
        require(stored.active, "active");
    }

    function testFundAndExecutePayroll() public {
        uint256 companyId = payroll.registerCompany("PayChad Demo");
        payroll.addEmployee(companyId, employee, 250e6);
        token.approve(address(payroll), 250e6);
        payroll.fundPayroll(companyId, 250e6);
        uint256 runId = payroll.createPayrollRun(companyId);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        payroll.executePayroll(companyId, runId, ids);
        require(token.balanceOf(employee) == 250e6, "employee unpaid");
        PayChadPayroll.Company memory company = payroll.getCompany(companyId);
        require(company.payrollBalance == 0, "balance remains");
    }

    function testOneRunCanExecuteMultipleBatches() public {
        uint256 companyId = payroll.registerCompany("PayChad Demo");
        payroll.addEmployee(companyId, employee, 100e6);
        payroll.addEmployee(companyId, employeeTwo, 150e6);
        token.approve(address(payroll), 250e6);
        payroll.fundPayroll(companyId, 250e6);
        uint256 runId = payroll.createPayrollRun(companyId);

        uint256[] memory firstBatch = new uint256[](1);
        firstBatch[0] = 1;
        payroll.executePayroll(companyId, runId, firstBatch);

        uint256[] memory secondBatch = new uint256[](1);
        secondBatch[0] = 2;
        payroll.executePayroll(companyId, runId, secondBatch);

        require(token.balanceOf(employee) == 100e6, "first employee unpaid");
        require(token.balanceOf(employeeTwo) == 150e6, "second employee unpaid");
        PayChadPayroll.Company memory company = payroll.getCompany(companyId);
        require(company.payrollBalance == 0, "balance remains");
    }

    function testDuplicateEmployeeInSameRunReverts() public {
        uint256 companyId = payroll.registerCompany("PayChad Demo");
        payroll.addEmployee(companyId, employee, 250e6);
        token.approve(address(payroll), 500e6);
        payroll.fundPayroll(companyId, 500e6);
        uint256 runId = payroll.createPayrollRun(companyId);
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 1;
        (bool ok,) = address(payroll).call(abi.encodeCall(payroll.executePayroll, (companyId, runId, ids)));
        require(!ok, "duplicate paid");
        require(token.balanceOf(employee) == 0, "partial payment");
    }

    function testUnauthorizedCompanyMutationReverts() public {
        uint256 companyId = payroll.registerCompany("PayChad Demo");
        UnauthorizedCaller caller = new UnauthorizedCaller();
        (bool ok,) = address(caller).call(abi.encodeCall(caller.addEmployee, (payroll, companyId, employee, 250e6)));
        require(!ok, "unauthorized mutation");
    }
}
