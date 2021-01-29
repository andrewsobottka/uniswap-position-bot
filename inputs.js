
/***** User Inputs *****/
exports.baseToken = 'WETH' // Token we'll sell to buy target token
exports.targetToken = 'WNXM' // Token we want to acquire
exports.targetPosition = '10000' // Reach a total position of X target tokens
exports.limitPrice = '0.035' // only buy if 1 target token <= X base tokens
exports.minTradeSize = '1' // Min Spend >= X ETH at a time
exports.maxTradeSize = '5' // Max Spend <= X ETH at a time