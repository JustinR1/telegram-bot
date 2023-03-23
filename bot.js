const TelegramBot = require("node-telegram-bot-api");
const token = require('./token.js')
const CoinGecko = require("coingecko-api");
const coinGeckoClient = new CoinGecko();
const axios = require('axios');

// import fetch from "node-fetch";

const bot = new TelegramBot(token, { polling: true });

bot.onText(/^(\?price)/, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
        const { soulPrice, kcalPrice } = await getCoinPrices();
        const responseText = `SOUL Price: $${soulPrice}\nKCAL Price: $${kcalPrice}\n\n`;
        bot.sendMessage(chatId, responseText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "An error occurred while fetching the coin prices.");
    }
});
// The ?info handler
bot.onText(/^(\?info)/, async (msg, match) => {
    const chatId = msg.chat.id;

    try {
        const { soulSupply, kcalSupply } = await getSupply();
        const soulMasterCount = await getSoulMaster();
        const stakerMembers = await getStakerMembers();
        const { soulPrice, kcalPrice, soulPriceChange, kcalPriceChange } = await getCoinPrices(); // Get the prices and price change

        let responseText = '';

        if (soulPrice !== null && kcalPrice !== null) { // Include prices if available
            responseText += `SOUL Price: $${soulPrice} | ${soulPriceChange >= 0 ? '+' : ''}24h: ${soulPriceChange}%  \nKCAL Price: $${kcalPrice} |  24h: ${kcalPriceChange >= 0 ? '+' : ''}${kcalPriceChange}%  \n\n`;
        }

        responseText += `SOUL Supply: ${soulSupply}  \nKCAL Supply: ${kcalSupply} \n\nSOUL Stakers: ${stakerMembers} \nSOUL Masters: ${soulMasterCount}`;

        bot.sendMessage(chatId, responseText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "An error occurred while fetching the data.");
    }
});

// The ?supply handler
const handleSupplyCommand = async (msg) => {
    const chatId = msg.chat.id;

    try {
        const { soulSupply, kcalSupply } = await getSupply();

        const responseText = `SOUL Supply: ${soulSupply}\nKCAL Supply: ${kcalSupply}`;
        bot.sendMessage(chatId, responseText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "An error occurred while fetching the supply data.");
    }
};

bot.onText(/^(\?supply)/, async (msg, match) => {
    await handleSupplyCommand(msg);
});

bot.on('channel_post', async (msg) => {
    if (msg.text.startsWith('?supply')) {
        const chatId = msg.chat.id;

        try {
            const { soulSupply, kcalSupply } = await getSupply();

            const responseText = `SOUL Supply: ${soulSupply}\nKCAL Supply: ${kcalSupply}`;
            bot.sendMessage(chatId, responseText);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "An error occurred while fetching the supply data.");
        }
    }
});

// The ?admin handler
bot.onText(/^(\?admin)/, async (msg, match) => {
    const chatId = msg.chat.id;

    try {
        const adminList = getAdmin();

        let responseText = `<strong>🚨ADMINS WILL NOT DM YOU FIRST!🚨</strong>\n\n${adminList}`;

        bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "An error occurred while fetching the data.");
    }
});

// The ?command handler
bot.onText(/^(\?help)/, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
        const commandLists = commandList();

        let responseText = `${commandLists}`;

        bot.sendMessage(chatId, responseText);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "An error occurred while fetching the data.");
    }
});

// The startup handler
bot.on("polling_error", (error) => console.error(error));
bot.on("webhook_error", (error) => console.error(error));
bot.on("error", (error) => console.error(error));
bot.on("message", (msg) => {
    if (msg.text && msg.text.toLowerCase() === "/start") {
        commandList();
        bot.sendMessage(msg.chat.id, responseText);
    }
});

// The general command handler (excluding ?supply)
bot.onText(/^(\?(?!supply|info|admin|help).+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const command = match[1];

    if (command === "/start") {
        return;
    }

    // compare command handler
    if (command.startsWith("?compare")) {
        const tokenB = command.slice(8).trim().toLowerCase();
        try {
            const marketCapData = await fetchMarketCaps(["soul", tokenB]);

            if (!marketCapData || !marketCapData["soul"] || !marketCapData[tokenB]) {
                console.error("Error fetching market cap data");
                return bot.sendMessage(chatId, "An error occurred. Please try again.");
            }

            const soulMarketCap = marketCapData["soul"].market_cap;
            const tokenBMarketCap = marketCapData[tokenB].market_cap;
            const soulPrice = marketCapData["soul"].price;
            const soulSupply = soulMarketCap / soulPrice;

            const soulPriceWithTokenBMarketCap = tokenBMarketCap / soulSupply;

            const responseText = `If SOUL had the same market cap as ${tokenB.toUpperCase()}, its price would be: $${soulPriceWithTokenBMarketCap.toFixed(2)}`;

            bot.sendMessage(chatId, responseText);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "An error occurred. Please try again.");
        }
    }

    // info command
    else if (command.startsWith("?") && !command.startsWith("?info")) {
        const input = command.slice(1).trim();

        try {
            const resolvedAddress = await lookUpAddress(input);
            if (!resolvedAddress) {
                console.log("Invalid input, neither a valid name nor a valid address.");
                return bot.sendMessage(chatId, "Invalid input. Not found.");
            }

            const response = await fetch(`https://bp1.phantasma.io/api/v1/GetAccount?account=${resolvedAddress}`);
            const data = await response.json();
            if (data.error) {
                console.log("Error", data.error);
                return bot.sendMessage(chatId, "Error: " + data.error);
            }

            let balances = data.balances || [];
            const soulBalanceIndex = balances.findIndex((balance) => balance.symbol === 'SOUL');
            if (soulBalanceIndex === -1) {
                balances.push({
                    symbol: 'SOUL',
                    decimals: 8,
                    amount: 0,
                    value: 0,
                });
            }
            let stakeAmount = data.stake;
            let address = data.address;
            const stakeDecimal = Math.pow(10, 8);
            stakeAmount = stakeAmount / stakeDecimal;
            const formattedStakeAmount = formatNumberWithCommas(stakeAmount, 3); // Format the stake amount after performing calculations
            const accountName = data.name;

            // Get the token prices and balances
            const symbols = balances.map((balance) => balance.symbol.toLowerCase());
            const balancePrices = await getBalancePrices(symbols);

            if (!balancePrices) {
                console.error("Error fetching balance prices");
                return bot.sendMessage(chatId, "An error occurred. Please try again.");
            }

            balances = balances.map((balance) => {
                const balancePrice = balancePrices[balance.symbol.toLowerCase()];
                if (balancePrice) {
                    const decimalValue = balance.decimals;
                    const multiplier = Math.pow(10, decimalValue);
                    const convertedAmount = balance.amount / multiplier;
                    const balanceValue = convertedAmount * balancePrice.price;
                    balance.value = balanceValue;
                } else {
                    balance.value = 0;
                }
                return balance;
            });

            balances.sort((a, b) => {
                if (b.value === a.value) {
                    return b.amount - a.amount;
                }
                return b.value - a.value;
            });

            // const stakeEmoji = getStakeEmoji(formattedStakeAmount);

            const soulPrice = balancePrices['soul'];
            let stakeValueText = '';
            let stakeValue = 0; // Initialize stakeValue variable
            if (soulPrice && stakeAmount > 0) {
                stakeValue = stakeAmount * soulPrice.price; // Use soulPrice.price instead of soulPrice
                stakeValueText = ` ($${stakeValue.toFixed(2)})`;
            }
            const stakedSoulBalanceIndex = balances.findIndex(balance => balance.symbol === 'Staked SOUL');
            if (stakedSoulBalanceIndex !== -1) {
                balances[stakedSoulBalanceIndex].value = stakeValue;
            }

            let totalValue = 0;
            responseText = `Account: ${accountName || "Not found"}\nStake Amount: ${formattedStakeAmount}${stakeValueText}\nAddress: ${address}\n\nBalances:\n`;
            totalValue += stakeValue;
            balances.forEach((balance) => {
                const balancePrice = balancePrices[balance.symbol.toLowerCase()];
                let valueText = '';
                if (balancePrice) {

                    const decimalValue = balance.decimals;
                    const multiplier = Math.pow(10, decimalValue);
                    const convertedAmount = balance.amount / multiplier;
                    const balanceValue = convertedAmount * balancePrice.price;
                    valueText = ` ($${balanceValue.toFixed(2)})`;

                    totalValue += balanceValue; // Add the balanceValue to the total value
                }

                const decimalValue = balance.decimals;
                const multiplier = Math.pow(10, decimalValue);
                const convertedAmount = balance.amount / multiplier;
                const formattedAmount = formatNumberWithCommas(convertedAmount, 3);

                responseText += `${balance.symbol} Amount: ${formattedAmount}${valueText}\n`;
            });

            responseText += `\nTotal Value: $${totalValue.toFixed(2)}\n`; // Add the total value to the response text
            const explorerURL = `\nℹ️ Get more in depth information with our <a href="https://explorer.phantasma.io/">Phantasma Explorer</a>`;
            responseText = responseText + explorerURL;

            bot.sendMessage(chatId, responseText, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "An error occurred. Please try again.");
        }
    } else if (!command.startsWith("?info")) {
        bot.sendMessage(chatId, "Invalid command. Please start your command with '?'. Example: ?your_name_or_address");
    } else if (command.startsWith("?supply")) {
        try {
            const supplyData = await getSupplyData();

            if (!supplyData) {
                console.error("Error fetching supply data");
                return bot.sendMessage(chatId, "An error occurred. Please try again.");
            }

            const circulatingSupply = supplyData.circulating_supply;
            const maxSupply = supplyData.max_supply;

            const responseText = `Circulating Supply: ${formatNumberWithCommas(circulatingSupply, 0)} SOUL\nMax Supply: ${formatNumberWithCommas(maxSupply, 0)} SOUL`;

            bot.sendMessage(chatId, responseText);
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, "An error occurred. Please try again.");
        }
    }
});



// Existing functions from your code
async function lookUpAddress(input) {
    if (input.startsWith("?getstaker") || input.startsWith("?getmaster")) {
        return input;
    }

    if (input.startsWith("P")) {
        return input;
    }

    if (input === "info") { // add this check
        return "info";
    }

    try {
        const response = await fetch(
            `https://bp1.phantasma.io/api/v1/LookUpName?name=${input.toLowerCase()}`
        );
        const data = await response.json();

        if (data.error) {
            console.log("API error:", data.error);
            return null;
        }

        if (data.startsWith("P")) {
            return data;
        }
    } catch (error) {
        console.error(error);
        return null;
    }

    return null;
}


async function getSupply() {
    try {
        const response = await fetch(
            "https://bp1.phantasma.io/api/v1/GetNexus?extended=true"
        );
        const data = await response.json();
        let soul = data.tokens.find((token) => token.symbol === "SOUL");
        let kcal = data.tokens.find((token) => token.symbol === "KCAL");
        if (soul) {
            soulToken = soul.symbol;
            console.log(soulToken);
        }
        if (kcal) {
            kcalToken = kcal.symbol;
            console.log(kcalToken);
        }
        soulSupply = soul.currentSupply;
        let soulSupplyDecimal = Math.pow(10, 8);
        soulSupply = soulSupply / soulSupplyDecimal;
        soulSupply = formatNumberWithCommas(soulSupply);
        console.log(soulSupply);

        kcalSupply = kcal.currentSupply;
        let kcalSupplyDecimal = Math.pow(10, 10);
        kcalSupply = kcalSupply / kcalSupplyDecimal;
        kcalSupply = formatNumberWithCommas(kcalSupply);
        console.log(kcalSupply);

    } catch (error) {
        console.error(error);
    }
    return { soulSupply, kcalSupply };
}

function formatNumberWithCommas(number, decimalPlaces = 0) {
    let [integerPart, decimalPart] = number.toFixed(decimalPlaces).toString().split(".");
    const formattedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (decimalPart) {
        decimalPart = decimalPart.replace(/0+$/, ""); // Remove trailing zeros
        if (decimalPart.length > 0) {
            return formattedIntegerPart + "." + decimalPart;
        }
    }
    return formattedIntegerPart;
}

async function getSoulMaster() {

    const response = await fetch('https://bp1.phantasma.io/api/v1/GetOrganization?ID=masters');
    let data = await response.json();
    let soulMaster = data.members.length;
    console.log(soulMaster);
    return soulMaster;

}

const getStakerMembers = async () => {
    try {
        const response = await fetch(
            "https://bp1.phantasma.io/api/v1/GetOrganization?ID=stakers");
        let stakers = await response.json();
        stakerMembers = stakers.members.length;
        stakerMembers = formatNumberWithCommas(stakerMembers);
        return stakerMembers; // Add this line
    } catch (error) {
        console.error(error);
    }
};

// function getStakeEmoji(stakeAmount) {
//     const stakeAmountNumber = parseFloat(stakeAmount.replace(/,/g, ""));
//     if (stakeAmountNumber >= 100000) {
//         return "🪙🪙🪙🪙🪙";
//     }
//     else if (stakeAmountNumber >= 50000) {
//         return "💸💸💸💸";
//     } else if (stakeAmountNumber >= 30000) {
//         return "💰💰💰";
//     } else if (stakeAmountNumber >= 10000) {
//         return "💰💰";
//     } else if (stakeAmountNumber >= 5000) {
//         return "💰";
//     }
//     return "";
// }

function getAdmin() {
    const admins = [
        { name: "🔨 Justin", username: "@ zeroproofs\n" },
        { name: "🔨 John", username: "@ JohnCTK\n" },
        { name: "🔨 Liam", username: "@ LiamLead\n" },
        { name: "🔨 Crypto Bull Boss", username: "@ cryptobullboss\n" },
        { name: "🔨 Gayle", username: "@ guz469\n" },
        { name: "🔨 Joseph", username: "@ JoesLanet\n" },
        { name: "🔨 Kashta", username: "@ CdnKash\n" },
        { name: "🔨 James", username: "@ PoLterjames\n" },
        { name: "🔨 Yang Wen-li", username: "@ nakloVKurt\n" },
        { name: "🔨 Spiderman", username: "@ Souldier_of_fortune\n" },
    ];
    return admins.map((admin) => `${admin.name}: ${admin.username}`).join("\n");
}

function commandList() {
    const commandsList = [

        "?<address_or_name> - Get the account balance of a Phantasma address or name\n",
        "?info - Provides the following: Price of SOUL, Supply of SOUL, Price of KCAL, Supply of KCAL, Master count, and Staker count\n",
        "?supply - Get the current supply of SOUL and KCAL\n",
        "?admin - Get the admin list. Click on one of these usernames to ensure you have the correct Admin when you initiate a DM. Admins will NEVER dm first.\n",
        "?help - Get the list of commands\n",
        "?compare <token> - This will display what the price of SOUL would be if it had the market cap of <token>"
    ];
    responseText = `Available Commands:\n\n` + commandsList.join("\n");
    return responseText;
}

async function getCoinPrices() {
    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: 'phantasma,phantasma-energy',
                vs_currencies: 'usd',
                include_24hr_change: 'true' // Include the 24-hour change
            }
        });

        const soulPrice = response.data['phantasma'].usd.toFixed(3);
        const kcalPrice = response.data['phantasma-energy'].usd.toFixed(3);
        const soulPriceChange = response.data['phantasma'].usd_24h_change;
        const kcalPriceChange = response.data['phantasma-energy'].usd_24h_change;

        return {
            soulPrice,
            kcalPrice,
            soulPriceChange: soulPriceChange !== null ? soulPriceChange.toFixed(2) : null,
            kcalPriceChange: kcalPriceChange !== null ? kcalPriceChange.toFixed(2) : null
        };
    } catch (error) {
        console.error(error);
        return {
            soulPrice: null,
            kcalPrice: null,
            soulPriceChange: null,
            kcalPriceChange: null
        };
    }
}

async function getBalancePrices(symbols) {
    try {
        const coinGeckoIds = {
            soul: 'phantasma',
            kcal: 'phantasma-energy',
            eth: 'ethereum',
            bnb: 'binancecoin',
            gas: 'gas',
        };

        const filteredSymbols = symbols.filter((symbol) => coinGeckoIds[symbol]);

        if (filteredSymbols.length === 0) {
            return {};
        }

        const coinGeckoSymbols = filteredSymbols.map((symbol) => coinGeckoIds[symbol]);
        const { data } = await coinGeckoClient.coins.markets({
            vs_currency: 'usd',
            ids: coinGeckoSymbols.join(','),
        });

        const prices = {};
        if (Array.isArray(data)) {
            data.forEach((coin) => {
                const symbol = Object.keys(coinGeckoIds).find((key) => coinGeckoIds[key] === coin.id);
                if (symbol) {
                    prices[symbol] = {
                        balance: 0, // Since we don't have the balance information here, set it to 0
                        price: coin.current_price,
                    };
                }
            });
        }
        return prices;
    } catch (error) {
        console.error(error);
        return null;
    }
}

const sleep = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

const fetchMarketCaps = async (symbols = null) => {
    try {
        const limit = 250;
        let page = 1;
        let marketCaps = {};
        let shouldFetchMore = true;

        while (shouldFetchMore) {
            const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=${page}&sparkline=false`;

            try {
                const response = await axios.get(url);

                if (response.data.length === 0) {
                    shouldFetchMore = false;
                } else {
                    response.data.forEach((coin) => {
                        if (!symbols || symbols.includes(coin.symbol)) {
                            marketCaps[coin.symbol] = {
                                market_cap: coin.market_cap,
                                price: coin.current_price,
                            };
                        }
                    });

                    // If the desired symbol(s) are found, stop fetching more pages
                    if (symbols && Object.keys(marketCaps).length === symbols.length) {
                        shouldFetchMore = false;
                    } else {
                        await sleep(2000); // Wait for 1.2 seconds between requests
                        page++;
                    }
                }
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    const retryAfter = parseInt(error.response.headers['retry-after'], 10) * 1000;
                    console.log(`Rate limit exceeded. Retrying after ${retryAfter} ms.`);
                    await new Promise((resolve) => setTimeout(resolve, retryAfter));
                } else {
                    console.error("Error fetching market cap data", error);
                    return null;
                }
            }
        }

        return marketCaps;
    } catch (error) {
        console.error("Error fetching market cap data", error);
        return null;
    }
};

async function getSupplyData() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/phantasma');
        const data = await response.json();
        return {
            circulating_supply: data.market_data.circulating_supply,
            max_supply: data.market_data.max_supply
        };
    } catch (error) {
        console.error('Error fetching supply data:', error);
        return null;
    }
}
