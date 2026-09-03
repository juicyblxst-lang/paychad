// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PayChadPayroll {
    error NotCompanyOwner();
    error CompanyNotFound();
    error EmployeeNotFound();
    error EmployeeAlreadyExists();
    error CompanyAlreadyExists();
    error InvalidAddress();
    error InvalidSalary();
    error InactiveEmployee();
    error InvalidRun();
    error AlreadyPaid();
    error InsufficientPayrollBalance();
    error TokenTransferFailed();
    error Reentrancy();

    struct Company {
        address owner;
        string name;
        uint64 employeeCount;
        uint64 nextRunId;
        uint256 payrollBalance;
    }

    struct Employee {
        address wallet;
        uint256 salary;
        bool active;
    }

    IERC20Minimal public immutable usdc;
    uint256 public nextCompanyId = 1;

    mapping(uint256 => Company) private companies;
    mapping(address => uint256) public companyIdByOwner;
    mapping(uint256 => mapping(uint256 => Employee)) private employees;
    mapping(uint256 => uint256[]) private employeeIds;
    mapping(uint256 => mapping(uint256 => uint64)) public lastPaidRun;

    uint256 private _entered;

    event CompanyRegistered(uint256 indexed companyId, address indexed owner, string name);
    event EmployeeAdded(uint256 indexed companyId, uint256 indexed employeeId, address indexed wallet, uint256 salary);
    event EmployeeStatusChanged(uint256 indexed companyId, uint256 indexed employeeId, bool active);
    event PayrollFunded(uint256 indexed companyId, address indexed funder, uint256 amount);
    event PayrollRunCreated(uint256 indexed companyId, uint256 indexed runId);
    event PayrollPayment(uint256 indexed companyId, uint256 indexed runId, uint256 indexed employeeId, address recipient, uint256 amount);
    event PayrollRunCompleted(uint256 indexed companyId, uint256 indexed runId, uint256 totalPaid, uint256 employeeCount);
    event PayrollWithdrawn(uint256 indexed companyId, address indexed recipient, uint256 amount);

    constructor(address usdcAddress) {
        if (usdcAddress == address(0)) revert InvalidAddress();
        usdc = IERC20Minimal(usdcAddress);
    }

    modifier companyOwner(uint256 companyId) {
        if (companies[companyId].owner == address(0)) revert CompanyNotFound();
        if (companies[companyId].owner != msg.sender) revert NotCompanyOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    function registerCompany(string calldata name) external returns (uint256 companyId) {
        if (companyIdByOwner[msg.sender] != 0) revert CompanyAlreadyExists();
        companyId = nextCompanyId++;
        companyIdByOwner[msg.sender] = companyId;
        companies[companyId] = Company({
            owner: msg.sender,
            name: name,
            employeeCount: 0,
            nextRunId: 1,
            payrollBalance: 0
        });
        emit CompanyRegistered(companyId, msg.sender, name);
    }

    function addEmployee(uint256 companyId, address wallet, uint256 salary)
        external
        companyOwner(companyId)
        returns (uint256 employeeId)
    {
        if (wallet == address(0)) revert InvalidAddress();
        if (salary == 0) revert InvalidSalary();

        Company storage company = companies[companyId];
        employeeId = uint256(company.employeeCount) + 1;
        if (employees[companyId][employeeId].wallet != address(0)) revert EmployeeAlreadyExists();

        employees[companyId][employeeId] = Employee({wallet: wallet, salary: salary, active: true});
        employeeIds[companyId].push(employeeId);
        company.employeeCount += 1;

        emit EmployeeAdded(companyId, employeeId, wallet, salary);
    }

    function setEmployeeActive(uint256 companyId, uint256 employeeId, bool active) external companyOwner(companyId) {
        Employee storage employee = employees[companyId][employeeId];
        if (employee.wallet == address(0)) revert EmployeeNotFound();
        employee.active = active;
        emit EmployeeStatusChanged(companyId, employeeId, active);
    }

    function fundPayroll(uint256 companyId, uint256 amount) external companyOwner(companyId) nonReentrant {
        if (amount == 0) revert InvalidSalary();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TokenTransferFailed();
        companies[companyId].payrollBalance += amount;
        emit PayrollFunded(companyId, msg.sender, amount);
    }

    function createPayrollRun(uint256 companyId) external companyOwner(companyId) returns (uint256 runId) {
        runId = companies[companyId].nextRunId++;
        emit PayrollRunCreated(companyId, runId);
    }

    function executePayroll(uint256 companyId, uint256 runId, uint256[] calldata ids)
        external
        companyOwner(companyId)
        nonReentrant
        returns (uint256 totalPaid)
    {
        if (runId == 0 || runId >= companies[companyId].nextRunId) revert InvalidRun();
        if (ids.length == 0) revert InvalidRun();

        Company storage company = companies[companyId];
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 employeeId = ids[i];
            Employee storage employee = employees[companyId][employeeId];
            if (employee.wallet == address(0)) revert EmployeeNotFound();
            if (!employee.active) revert InactiveEmployee();
            if (lastPaidRun[companyId][employeeId] == uint64(runId)) revert AlreadyPaid();
            if (company.payrollBalance < employee.salary) revert InsufficientPayrollBalance();

            lastPaidRun[companyId][employeeId] = uint64(runId);
            company.payrollBalance -= employee.salary;
            totalPaid += employee.salary;

            if (!usdc.transfer(employee.wallet, employee.salary)) revert TokenTransferFailed();
            emit PayrollPayment(companyId, runId, employeeId, employee.wallet, employee.salary);
        }

        emit PayrollRunCompleted(companyId, runId, totalPaid, ids.length);
    }

    function withdrawPayroll(uint256 companyId, uint256 amount) external companyOwner(companyId) nonReentrant {
        Company storage company = companies[companyId];
        if (amount == 0 || amount > company.payrollBalance) revert InsufficientPayrollBalance();
        company.payrollBalance -= amount;
        if (!usdc.transfer(msg.sender, amount)) revert TokenTransferFailed();
        emit PayrollWithdrawn(companyId, msg.sender, amount);
    }

    function getCompany(uint256 companyId) external view returns (Company memory) {
        if (companies[companyId].owner == address(0)) revert CompanyNotFound();
        return companies[companyId];
    }

    function getEmployee(uint256 companyId, uint256 employeeId) external view returns (Employee memory) {
        Employee memory employee = employees[companyId][employeeId];
        if (employee.wallet == address(0)) revert EmployeeNotFound();
        return employee;
    }

    function getEmployeeIds(uint256 companyId) external view returns (uint256[] memory) {
        if (companies[companyId].owner == address(0)) revert CompanyNotFound();
        return employeeIds[companyId];
    }

    function getCompanyForOwner(address owner) external view returns (uint256 companyId) {
        companyId = companyIdByOwner[owner];
    }
}
