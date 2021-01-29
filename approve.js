
async function approveToken(tokenInstance, receiver, amount, fromAccount) {
    try {
        let approval = await tokenInstance.methods.approve(receiver, amount).send({ from: fromAccount })
        console.log(`ERC20 token approved: tx/${approval.transactionHash}`)
        return amount

    } catch (error) {
        console.log('ERC20 could not be approved')
        console.error(`Error approving token: ${error}`)
    }   
}

module.exports = { approveToken }