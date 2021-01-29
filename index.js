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
//--- directory files
const inputs = require('./inputs.js')
const approve = require('./approve.js')
const contractData = JSON.parse(fs.readFileSync('./contractData.json')) // download latst from https://github.com/andrewsobottka/eth-data

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

//----- CONTRACT for Target Token -----//
const targetTokenData = contractData[inputs.targetToken]
const targetToken = new web3.eth.Contract(targetTokenData.abi, targetTokenData.address)

//------ CONTRACT for Base Token -----//
const baseTokenData = contractData[inputs.baseToken]
const baseToken = new web3.eth.Contract(baseTokenData.abi, baseTokenData.address)


//----- USER INPUTS -----//
//const baseTokenApproved = web3.utils.toWei(inputs.baseTokenApproved, 'mwei') // converted to units of wei
var minTrade = web3.utils.toWei(inputs.minTradeSize, 'ether') // In units of base token, converted to no decimals
var maxTrade = web3.utils.toWei(inputs.maxTradeSize, 'ether') // In units of base token, converted to no decimals
var limitPrice = inputs.limitPrice // max base tokens to pay for 1 target token
var baseTokenApproved = web3.utils.toWei(inputs.targetPosition, 'ether') // Setting approval request equal to target position
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
    
    console.log('-- Checking Wallet Balances...')
    
    //----- Check Total Balances in Wallet -----//
    //  If total balance in wallet is less than target balance, continue; otherwise
    //  the target balance has been reached, exit the program.
    baseBalance = await baseToken.methods.balanceOf(process.env.ACCOUNT).call()
    baseBalance = web3.utils.fromWei(baseBalance.toString(), 'ether')
    console.log('       Balance in Wallet:', baseBalance,targetTokenData.symbol)
    
    targetBalance = await targetToken.methods.balanceOf(process.env.ACCOUNT).call()
    targetBalance = web3.utils.fromWei(targetBalance.toString(), 'ether')
    console.log('       Balance in Wallet:', targetBalance, targetTokenData.symbol)
    
    if (targetBalance >= inputs.targetPosition) {
        console.log('Target of', inputs.targetPosition,' reached!')
        clearInterval(priceMonitor)
        return
    } 
    
    console.log('-- Confirming', baseTokenData.symbol ,'is approved to trade...')
    console.log('* Commented out for Testing *')
    
    //----- ERC20 Token Approval -----// Approval not needed: baseToken=ETH & PrivKey is provided
    //approvalStatus = JSON.parse(fs.readFileSync('approvalStatus.json'))
    //currApprovedAmount = approvalStatus.approvedAmount
    //if (currApprovedAmount <= maxTrade) {
    //    currApprovedAmount = await approve.approveToken(baseToken, contractData.address, baseTokenApproved, tradingAccount)
    //    console.log('Additional', baseTokenData.address, 'Approved: ', currApprovedAmount)
    //    var newApprovedAmount = { approvedAmount: currApprovedAmount}
    //    fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');
    //    return
    //}
        
        
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

        if (inGivenPrice < minTrade) {
            console.log('Insufficient liquidity...')
        } else {

        baseTokenIn = web3.utils.toBN(Math.min(inGivenPrice, maxTrade))
        console.log('     Executing Trade for:', web3.utils.fromWei(baseTokenIn.toString(),'ether'), baseTokenData.symbol)
        // Effective Price <- based on actual values traded
        //  outGivenIn = outputBalance * (1- ( (inputBalance/(inputBalance + inputAmount))**(inputWeight / outputWeight) ) )
        outGivenIn = targetTokenReserve.toString() * (1-((baseTokenReserve / baseTokenReserve.add(baseTokenIn)) ** (0.5/0.5) ) )
        console.log('         Expected Return:', web3.utils.fromWei(outGivenIn.toString(),'ether'), targetTokenData.symbol)
        effectivePrice = baseTokenIn / outGivenIn
        console.log('         Effective Price:', effectivePrice.toString(),baseTokenData.symbol,'per',targetTokenData.symbol)

        //----- Execute Buy -----//            
        console.log('-- Executing swap...')
        
        var gasPrice = await web3.eth.getGasPrice()
        gasPrice = web3.utils.toBN(gasPrice * 1.10) // will pay 10% above current avg. gas prices to expedite transaction
        
//UPDATE    var gasLimit = await pool.methods.swap(
//              baseTokenData.address,
//              targetTokenData.address,
//              web3.utils.toWei(inputs.maxTradeSize,'ether'),
//              SCresult.returnAmount, //No slippage
//              SCresult.distribution,
//              0
//          ).estimateGas({
//              from: process.env.ACCOUNT,
//          })
                        
//UPDATE    var swapExecution = await pool.methods.swap(
//              baseTokenData.address,
//              targetTokenData.address,
//              web3.utils.toWei(inputs.maxTradeSize,'ether'),
//              SCresult.returnAmount, //No slippage
//              SCresult.distribution,
//              0
//          ).send({
//              from: process.env.ACCOUNT,
//              gas: gasLimit,
//              gasPrice: gasPrice,
//              value: web3.utils.toWei(inputs.maxTradeSize,'ether')
//          })
            
//          console.log(swapExecution)

            //----- Update Approval Counter -----//
            //currApprovedAmount = currApprovedAmount - baseTokenIn
            //var newApprovedAmount = {approvedAmount: currApprovedAmount}
            //fs.writeFileSync('./approvalStatus.json', JSON.stringify(newApprovedAmount, null, 2) , 'utf-8');

            console.log('-- Swap Complete...')
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
