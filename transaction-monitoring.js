
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
const { start } = require('repl')
const contractData = JSON.parse(fs.readFileSync('./contractData.json')) // download latst from https://github.com/andrewsobottka/eth-data

//----- WEB 3 CONFIG -----//
//const web3 = new Web3('wss://mainnet.infura.io/ws/v3/201292230a8a4241b6ba2b14a00fca47')
const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL))
web3.eth.transactionConfirmationBlocks = 1 // FOR GANACHE TESTING ONLY

//----- CONTRACT DETAILS for Pool -----//
const poolData = contractData['Uniswap V2 USDC-WETH'] //V2 Pool; requires WETH
const pool = new web3.eth.Contract(poolData.abi, poolData.address)

//------ CONTRACT for Base Token -----//
const baseTokenData = contractData[inputs.baseToken]
//const baseToken = new web3.eth.Contract(baseTokenData.abi, baseTokenData.address)

//----- CONTRACT for Target Token -----//
const targetTokenData = contractData[inputs.targetToken]
//const targetToken = new web3.eth.Contract(targetTokenData.abi, targetTokenData.address)


//////////////////////////////////////////////////////////////////////////////
//                               FUNCTIONS                                  //
//////////////////////////////////////////////////////////////////////////////

//var lastLargeTransaction = "n/a"
var BLOCKS_TO_ANALYZE = 5

/*
//----- Watching a Uniswap Pool...
async function watchEvents() {
    var blockNumber = await web3.eth.getBlockNumber()
    console.log('Start listening at block:', blockNumber)
    
    var swaps = pool.events.Swap({fromBlock: blockNumber},function(error, event){})
    .on('data', function(event){
        baseTokenTrade = web3.utils.toBN(event.returnValues.amount0In - event.returnValues.amount0Out)
        baseTokenTrade = web3.utils.fromWei(baseTokenTrade, 'mwei')
        targetTokenTrade = web3.utils.toBN(event.returnValues.amount1In - event.returnValues.amount1Out)
        targetTokenTrade = web3.utils.fromWei(targetTokenTrade, 'ether')
        eventBlockNumber = event.blockNumber
        //blockData = web3.eth.getBlock(eventBlockNumber).then(result => {blockData = result})
        //blockTime = blockData.timestamp

        if (Math.abs(targetTokenTrade) > 1.5) {
            console.log('Large wETH Position Change!...')
            //console.log('             Transaction:',event.transactionHash)
            console.log('                    Block:',eventBlockNumber.toString())
            console.log('                    USDC:',baseTokenTrade.toString())
            console.log('                    wETH:',targetTokenTrade.toString())
        } else {
            console.log('Small wETH Position Change...')
            //console.log('             Transaction:',event.transactionHash)
            console.log('                    Block:',eventBlockNumber.toString())
            console.log('                    USDC:',baseTokenTrade.toString())
            console.log('                    wETH:',targetTokenTrade.toString())
        }
    })
    .on('error', console.error)

}
*/

async function recentEvents() {
    var blockNumber = await web3.eth.getBlockNumber()
    console.log('-- Starting Analysis')

    startingBlock = (blockNumber - BLOCKS_TO_ANALYZE)
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
        //console.log(`Transaction ${i}:`,swaps[i].transactionHash)
        baseTokenTransaction = web3.utils.toBN(swaps[i].returnValues.amount0In - swaps[i].returnValues.amount0Out)
        baseTokenDelta = baseTokenDelta.add(web3.utils.toBN(swaps[i].returnValues.amount0In))
        baseTokenDelta = baseTokenDelta.sub(web3.utils.toBN(swaps[i].returnValues.amount0Out))
        targetTokenTransaction = web3.utils.toBN(swaps[i].returnValues.amount1In - swaps[i].returnValues.amount1Out)
        targetTokenDelta = targetTokenDelta.add(web3.utils.toBN(swaps[i].returnValues.amount1In))
        targetTokenDelta = targetTokenDelta.sub(web3.utils.toBN(swaps[i].returnValues.amount1Out))
        
        //console.log('     USDC in Transaction:',web3.utils.fromWei(baseTokenTransaction,'mwei'))
        //console.log('     wETH in Transaction:',web3.utils.fromWei(targetTokenTransaction,'ether'))
    }
    
    console.log('         Blocks Analyzed:',BLOCKS_TO_ANALYZE)
    console.log('   Transactions Analyzed:',swaps.length)
    console.log('                    From:',startTime.toUTCString())
    console.log('                      To:',endTime.toUTCString())
    console.log('  Aggregated USDC Change:',web3.utils.fromWei(baseTokenDelta,'mwei'))
    console.log('  Aggregated wETH Change:',web3.utils.fromWei(targetTokenDelta,'ether'))
    console.log('-- Analysis complete')
    
}

recentEvents().then(() => process.exit())


