### Overview
This script leverages Uniswap's smart contracts to acquire a specified number of targetTokens where targetToken is the ERC20 token being acquired and baseToken is ETH (can be configured to an ERC20 token) being spent.

### Contents

index.js => contains all the main code for the application

inputs.js => the "configuration file" where the user of this app would input variables

.env => [NOT SHOWN] the "environment file" where the user of this app would enter sensitive variables (as of 1/27/2021: infura URL, account, and private key) 

approve.js => contains the function that submits the request for approval for an ERC20 token. As of 1/27/2021 this is n/a since the current script uses ETH which does not require approval as long as PrivKey is provided in web3 setup.

approvalStatus.json => contains the current amount of baseToken approved. 

contractData.json => contains a point-in-time version of the contractData.json file stored in the eth-data repository.