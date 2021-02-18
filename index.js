//--- basic packages
require('dotenv').config()
const _ = require('lodash')
const fs = require('fs')
const http = require('http')
const express = require('express')
//--- add'l dependencies
const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const BN = require('bn.js')
const moment = require('moment')
//--- directory files
const inputs = require('./inputs.js')
const approve = require('./approve.js')
const contractData = JSON.parse(fs.readFileSync('./contractData.json')) // download latest from https://github.com/andrewsobottka/eth-data

//----- SERVER CONFIG -----//
const PORT = process.env.PORT || 5000
const app = express()
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${ PORT }`))

//----- WEB 3 CONFIG -----//
const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL))
web3.eth.transactionConfirmationBlocks = 1 // FOR GANACHE TESTING ONLY

//----- CONTRACT DETAILS for Pool -----//
const poolData = contractData['Uniswap V2 WETH-WNXM'] //V2 Pool; requires WETH
const pool = new web3.eth.Contract(poolData.abi, poolData.address)
pool.transactionConfirmationBlocks = 1 // FOR GANACHE TESTING ONLY

//----- CONTRACT DETAILS for Uniswap Router -----//
const routerData = contractData['Uniswap V2 Router02'] //V2 Router
const router = new web3.eth.Contract(routerData.abi, routerData.address)
router.transactionConfirmationBlocks = 1 // FOR GANACHE TESTING ONLY

//------ CONTRACT for Base Token -----//
const baseTokenData = contractData[inputs.baseToken]
const baseToken = new web3.eth.Contract(baseTokenData.abi, baseTokenData.address)

//----- CONTRACT for Target Token -----//
const targetTokenData = contractData[inputs.targetToken]
const targetToken = new web3.eth.Contract(targetTokenData.abi, targetTokenData.address)


//----- USER INPUTS -----//
var minTrade = web3.utils.toWei(inputs.minTradeSize, 'ether') // In units of base token, converted to no decimals
var maxTrade = web3.utils.toWei(inputs.maxTradeSize, 'ether') // In units of base token, converted to no decimals
var limitPrice = inputs.limitPrice // max base tokens to pay for 1 target token
var baseTokenApproved = web3.utils.toWei(inputs.maxApproval, 'ether') // Setting approval request equal to target position
var tradingAccount = process.env.ACCOUNT

//////////////////////////////////////////////////////////////////////////////
//                               FUNCTIONS                                  //
//////////////////////////////////////////////////////////////////////////////

let priceMonitor
let monitoringPrice = false

async function monitorPrice() {
    if (monitoringPrice) {
        return
    }

    console.log('--------------------------------------------------')
    console.log('-- Checking Wallet Balances...')
    
    //----- Check Total Balances in Wallet -----//
    //  If total balance in wallet is less than target balance, continue; otherwise
    //  the target balance has been reached, exit the program.
    baseBalance = await baseToken.methods.balanceOf(process.env.ACCOUNT).call()
    baseBalance = web3.utils.fromWei(baseBalance.toString(), 'ether')
    console.log('       Balance in Wallet:', baseBalance, baseTokenData.symbol)
    
    targetBalance = await targetToken.methods.balanceOf(process.env.ACCOUNT).call()
    targetBalance = web3.utils.fromWei(targetBalance.toString(), 'ether')
    console.log('       Balance in Wallet:', targetBalance, targetTokenData.symbol)
    
    if (Number(baseBalance) < Number(inputs.minTradeSize)) {
        console.log('Insufficient',baseTokenData.symbol)
        clearInterval(priceMonitor)
        return
    } 

    if (Number(targetBalance) >= Number(inputs.targetPosition)) {
        console.log('Target of', inputs.targetPosition,' reached!')
        clearInterval(priceMonitor)
        return
    } 
    
    console.log('-- Confirming', baseTokenData.symbol ,'is approved to trade...')
    
    //----- ERC20 Token Approval -----// Approval not needed if baseToken=ETH & PrivKey is provided
    approvalStatus = await JSON.parse(fs.readFileSync('approvalStatus.json'))
    currApprovedAmount = approvalStatus.approvedAmount
    if (currApprovedAmount <= maxTrade) {
        try{
            currApprovedAmount = await approve.approveToken(baseToken, routerData.address, baseTokenApproved, tradingAccount)
            console.log('   Additional', baseTokenData.symbol, 'Approved:', currApprovedAmount)
            var newApprovedAmount = { approvedAmount: currApprovedAmount}
            fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');
        } catch (error) {
            console.log('Error')    
            return
        }
    } else {
        console.log('      Remaining Approved:',web3.utils.fromWei(currApprovedAmount.toString(),'ether'))
    }
    
     
    //----- Starting Price Check && Swap -----//
    console.log('-- Checking spot price...')
    monitoringPrice = true
    
    try {
        //----- Constant Function Market Maker Equations -----//
        let baseTokenWeight = web3.utils.toWei('0.5','ether')
        let targetTokenWeight = web3.utils.toWei('0.5','ether')
        let tokenReserves = await pool.methods.getReserves().call()
        let targetTokenReserve = web3.utils.toBN(tokenReserves[0])
        let baseTokenReserve = web3.utils.toBN(tokenReserves[1])
        
        // Spot Price <- for infinitely small values with no slippage
        currentSpotPrice = (baseTokenReserve / baseTokenWeight) / (targetTokenReserve / targetTokenWeight)
        console.log('      Current Spot Price:', currentSpotPrice.toString(),baseTokenData.symbol,'per',targetTokenData.symbol)
        console.log('             Limit price:',limitPrice, baseTokenData.symbol,'per',targetTokenData.symbol)
        
        // In-Given-Price <- What is the max we can put in before price moves beyond limit? See Balancer whitepaper
        //  inGivenPrice = inputTokenBalance * ( ( (targetPrice/currentSpotPrice) ** (outputTokenWeight/(outputTokenWeight + inputTokenWeight)) ) -1 )
        inGivenPrice = baseTokenReserve.toString() * ( ( (web3.utils.toWei(limitPrice,'ether') / web3.utils.toWei(currentSpotPrice.toString(),'ether')) ** (0.5) ) -1 )
        inGivenPrice = Math.floor(inGivenPrice)
        console.log('   Max Trade Opportunity:', web3.utils.fromWei(inGivenPrice.toString(),'ether'), baseTokenData.symbol)
        console.log('         Min Trade Limit:', web3.utils.fromWei(minTrade,'ether'), baseTokenData.symbol)
        console.log('         Max Trade Limit:', web3.utils.fromWei(maxTrade,'ether'), baseTokenData.symbol)

        //----- Aggregate Recent Transactions -----//
        console.log('- Checking recent transactions...')
        var blockNumber = await web3.eth.getBlockNumber()

        startingBlock = (blockNumber - inputs.blocksToAnalyze)
        blockInfo = await web3.eth.getBlock(startingBlock)
        blockTimestamp = blockInfo.timestamp
        startTime = new Date(blockTimestamp * 1000)

        blockInfo = await web3.eth.getBlock(blockNumber)
        blockTimestamp = blockInfo.timestamp
        endTime = new Date(blockTimestamp * 1000)

        var swaps = await pool.getPastEvents('Swap', {
            fromBlock: startingBlock,
            toBlock: blockNumber
        })
        
        let baseTokenDelta = web3.utils.toBN(0)
        let targetTokenDelta = web3.utils.toBN(0)

        for (var i = 0; i < swaps.length; i++){
            baseTokenTransaction = web3.utils.toBN(swaps[i].returnValues.amount1In - swaps[i].returnValues.amount1Out)
            baseTokenDelta = baseTokenDelta.add(web3.utils.toBN(swaps[i].returnValues.amount1In))
            baseTokenDelta = baseTokenDelta.sub(web3.utils.toBN(swaps[i].returnValues.amount1Out))
            targetTokenTransaction = web3.utils.toBN(swaps[i].returnValues.amount0In - swaps[i].returnValues.amount0Out)
            targetTokenDelta = targetTokenDelta.add(web3.utils.toBN(swaps[i].returnValues.amount0In))
            targetTokenDelta = targetTokenDelta.sub(web3.utils.toBN(swaps[i].returnValues.amount0Out))
        }
        
        console.log('         Blocks Analyzed:',inputs.blocksToAnalyze)
        console.log('   Transactions Analyzed:',swaps.length)
        console.log('                    From:',startTime.toUTCString())
        console.log('                      To:',endTime.toUTCString())
        console.log('               -',baseTokenData.symbol,'Change:',web3.utils.fromWei(baseTokenDelta,'ether'))
        console.log('               -',targetTokenData.symbol,'Change:',web3.utils.fromWei(targetTokenDelta,'ether'))

        baseTokenIn = web3.utils.toBN(Math.min(inGivenPrice, maxTrade, web3.utils.toWei((baseBalance - 0.001).toString(),'ether')))
        console.log('         Trying to Trade:', web3.utils.fromWei(baseTokenIn.toString(),'ether'), baseTokenData.symbol)
        
        console.log('-- Checking availability...')
        if (inGivenPrice < minTrade) { //Check Liquidity - can we trade at least our Min Trade Size without affecting price?
            console.log(' * Insufficient pool liquidity *')
        } else if ((Number(web3.utils.fromWei(baseTokenIn.toString(),'ether')) + Number(web3.utils.fromWei(baseTokenDelta,'ether'))) > 85 ) { //Check Recent Transactions - are we trading against recent opposing trades?
            console.log(' * Insufficient opposing trades *')
        } else {
        // Effective Price <- based on actual values traded
        quote = await router.methods.getAmountOut(baseTokenIn, baseTokenReserve, targetTokenReserve).call()
        console.log('           Quoted Return:', web3.utils.fromWei(quote.toString(),'ether'), targetTokenData.symbol)
        effectivePrice = baseTokenIn / quote
        console.log('         Effective Price:', effectivePrice.toString(),baseTokenData.symbol,'per',targetTokenData.symbol)

        //----- Execute Buy -----//            
        console.log('-- Executing swap...')
        
        var gasPrice = await web3.eth.getGasPrice()
        gasPrice = web3.utils.toBN(gasPrice * 1.10) // will pay 10% above current avg. gas prices to expedite transaction

        let now = moment().unix() // fetch current unix timestamp
        let deadline = now + 60 // add 60 seconds
        let amountOutMin = (quote * 0.99).toString() // 1% slippage
        let addressPath = [baseTokenData.address,targetTokenData.address]

        var gasLimit = await router.methods.swapExactTokensForTokens(
            baseTokenIn,
            amountOutMin,
            addressPath,
            process.env.ACCOUNT,
            deadline
            ).estimateGas({from: process.env.ACCOUNT,})
        
        var gasLimitBN = new BN(gasLimit.toString())
        var gasPriceBN = new BN(gasPrice.toString())
        var totalGasCost = gasLimitBN.mul(gasPriceBN)
        console.log('                Gas Cost:',web3.utils.fromWei(totalGasCost.toString(), 'ether'))
        console.log('           Max Gas Limit:',inputs.maxGasPayment)

        if (Number(web3.utils.fromWei(totalGasCost.toString(), 'ether')) > inputs.maxGasPayment) {
            console.log(' * Cost of Gas Exceeds Limit *')
        } else {

        var swapExecution = await router.methods.swapExactTokensForTokens(
            baseTokenIn,
            amountOutMin,
            addressPath,
            process.env.ACCOUNT,
            deadline
            ).send({
                from: process.env.ACCOUNT,
                gas: gasLimit,
                gasPrice: gasPrice
                //value: baseTokenIn
            })
            
        console.log('         Swap successful:', swapExecution.transactionHash)

        //----- Update Approval Counter -----//
        currApprovedAmount = currApprovedAmount - baseTokenIn
        var newApprovedAmount = {approvedAmount: currApprovedAmount}
        fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');

        console.log('-- Process Complete...')
        }
        }

    } catch (error) {
        console.error(error)
        monitoringPrice = false
        clearInterval(priceMonitor)
        return
    }
    monitoringPrice = false
}

//----- Continuously Run Monitoring Function -----//
// Checks pool every n seconds
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 2000 // 2 Seconds
priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)
