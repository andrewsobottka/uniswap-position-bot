
/***** User Inputs *****/
exports.baseToken = 'WETH' // Token we'll sell to buy target token
exports.targetToken = 'WNXM' // Token we want to acquire
exports.targetPosition = '4500' // Reach a total position of X target tokens
exports.limitPrice = '0.07' // only buy if 1 target token <= X base tokens
exports.minTradeSize = '1' // Min Spend >= X ETH at a time
exports.maxTradeSize = '5' // Max Spend <= X ETH at a time
exports.maxApproval = '25' 
exports.blocksToAnalyze = '25' //Number of blocks worth of Transactions to analyze
exports.maxGasPayment = '0.0025' // ETH; where Gas Payment = Gas Price * Gas Limit
