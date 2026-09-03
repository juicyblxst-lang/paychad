export const payrollAbi = [
  {
    type: "function",
    name: "companyIdByOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCompany",
    stateMutability: "view",
    inputs: [{ name: "companyId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "name", type: "string" },
          { name: "employeeCount", type: "uint64" },
          { name: "nextRunId", type: "uint64" },
          { name: "payrollBalance", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "registerCompany",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "companyId", type: "uint256" }],
  },
  {
    type: "function",
    name: "addEmployee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "companyId", type: "uint256" },
      { name: "wallet", type: "address" },
      { name: "salary", type: "uint256" },
    ],
    outputs: [{ name: "employeeId", type: "uint256" }],
  },
  {
    type: "function",
    name: "createPayrollRun",
    stateMutability: "nonpayable",
    inputs: [{ name: "companyId", type: "uint256" }],
    outputs: [{ name: "runId", type: "uint256" }],
  },
  {
    type: "function",
    name: "executePayroll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "companyId", type: "uint256" },
      { name: "runId", type: "uint256" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ name: "totalPaid", type: "uint256" }],
  },
  {
    type: "function",
    name: "fundPayroll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "companyId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "CompanyRegistered",
    anonymous: false,
    inputs: [
      { indexed: true, name: "companyId", type: "uint256" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "name", type: "string" },
    ],
  },
  {
    type: "event",
    name: "PayrollPayment",
    anonymous: false,
    inputs: [
      { indexed: true, name: "companyId", type: "uint256" },
      { indexed: true, name: "runId", type: "uint256" },
      { indexed: true, name: "employeeId", type: "uint256" },
      { indexed: false, name: "recipient", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;
