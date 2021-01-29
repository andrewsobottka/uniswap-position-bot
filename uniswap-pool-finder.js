//--- basic packages
require('dotenv').config()
const _ = require('lodash')
const fs = require('fs')
const http = require('http')
//--- add'l dependencies
const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')
//--- directory files
const inputs = require('./inputs.js')
const approve = require('./approve.js')
const contractData = JSON.parse(fs.readFileSync('./contractData.json')) // download latst from https://github.com/andrewsobottka/eth-data

//----- WEB 3 CONFIG -----//
const web3 = new Web3(new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL))
web3.eth.transactionConfirmationBlocks = 1 // FOR GANACHE TESTING ONLY

//----- CONTRACT DETAILS for Factory -----//
const factoryData = contractData['Uniswap V2 Factory'] //
const factoryContract = new web3.eth.Contract(factoryData.abi, factoryData.address)
factoryContract.transactionConfirmationBlocks = 1 // FOR GANACHE TESTING ONLY

//----- CONTRACT for Target Token -----//
const targetTokenData = contractData[inputs.targetToken]
const targetToken = new web3.eth.Contract(targetTokenData.abi, targetTokenData.address)

//------ CONTRACT for Base Token -----//
const baseTokenData = contractData[inputs.baseToken]
const baseToken = new web3.eth.Contract(baseTokenData.abi, baseTokenData.address)


async function exchangeInfo () {
    const exchangeAddress = await factoryContract.methods.getPair(baseTokenData.address, targetTokenData.address).call()
    console.log('Trading Pair:',baseTokenData.symbol,'<>',targetTokenData.symbol)
    console.log('Uniswap V2 Pool address: ', exchangeAddress)

    baseTokenReserve = await baseToken.methods.balanceOf(exchangeAddress).call()
    console.log(baseTokenData.symbol,'in pool: ', tokenReserve)
    
    targetTokenReserve = await targetToken.methods.balanceOf(exchangeAddress).call()
    console.log(targetTokenData.symbol,'in pool: ', tokenReserve)
}

exchangeInfo()
