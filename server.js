/**
 * Arsenal Online - Master Server
 * ©2024 Wilkin Games
 * https://wilkingames.com - https://arsenalonline.net
 */
const chalk = require("chalk");
const log = console.log;
const RateLimit = require('express-rate-limit');
const escape = require('escape-html');

// set up rate limiter: maximum of 100 requests per 15 minutes
const limiter = RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max 100 requests per windowMs
});
const GameMode = {
    TIME_ATTACK: "time_attack",
    DEFENDER: "defender",
    SNIPER: "sniper",
    SHOOTER: "shooter",
    HARDENED: "hardened",
    REFLEX: "reflex",
    LAVA: "lava",
    WAR: "war",
    BREACH: "breach",
    RANGE: "range"
};
const MathUtil = {
    Random: (_min, _max) =>
    {
        return Math.floor(Math.random() * (_max - _min + 1)) + _min;
    },
    RandomBoolean: () =>
    {
        return Math.random() >= 0.5;
    },
    RoundToNearest: (_num, _val = 5) =>
    {
        return Math.ceil(_num / _val) * _val;
    }
};
const GameUtil = {
    RandomId: () => 
    {
        return Math.random().toString(36).substring(2, 10);
    },  
    RandomPromoKeyId: () =>
    {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
        var rand = (min = 0, max = 1000) => Math.floor(Math.random() * (max - min) + min);
        var randChar = (length = 10) => {
          const randchars = [];
          for (let i = 0; i < length; i++) {
            randchars.push(chars[rand(0, chars.length)]);
          }        
          return randchars.join("");
        }
        var prefix = "P-";
        var suffix = "";
        return `${prefix}${randChar()}${suffix}`;
    },
    ConvertToTimeString: (_seconds) =>
    {
        _seconds = Math.max(0, Math.ceil(_seconds));
        var s = _seconds % 60;
        var ms = (_seconds % 1) * 100;
        var m = Math.floor((_seconds % 3600) / 60);
        var h = Math.floor(_seconds / (60 * 60));
        var hourStr = (h == 0) ? "" : doubleDigitFormat(h) + ":";
        var minuteStr = doubleDigitFormat(m) + ":";
        var secondsStr = doubleDigitFormat(s);
        function doubleDigitFormat(_num)
        {
            if (_num < 10) 
            {
                return ("0" + _num);
            }
            return String(_num);
        }
        return hourStr + minuteStr + secondsStr;
    },
    FormatNum: (_num) =>
    {
        if (isNaN(_num))
        {
            return "";
        }
        return _num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
}
const SteamItem = {
    CREDITS_1: "credits_1",
    CREDITS_2: "credits_2",
    CREDITS_3: "credits_3",
    CREDITS_4: "credits_4",
    CREDITS_5: "credits_5",
    CREDITS_6: "credits_6",
    BUNDLE_SKINS: "bundle_skins",
    BUNDLE_STYLES: "bundle_styles",
    BUNDLE_SUPER_WEAPONS: "bundle_super_weapons"
};
var settings = require("./settings.json");
var banned = require("./banned.json");
var challenges = require("./challenges.json");
var auth = require("./auth.json");

//API
const URL_API = "https://arsenalonline.net/data/account.txt";

//Hathora
const HATHORA_APP_MULTIPLAYER = auth.hathora?.appId;

//Xsolla
const XSOLLA_API_KEY = auth.xsolla?.apiKey;

//Centarius
const CENTARIUS_ID = auth.centarius?.key;

//Steamworks
const STEAM_URL_TXN = auth.steam?.url;
const STEAM_PUBLISHER_KEY = auth.steam?.publisherKey;
const STEAM_APP_ID = auth.steam?.appId;

//Steam bundle prices
const CURRENCY = "USD";
const USD_CREDITS_1000 = "99";
const USD_CREDITS_5000 = "299";
const USD_CREDITS_10000 = "499";
const USD_CREDITS_50000 = "799";
const USD_CREDITS_100000 = "1299";
const USD_CREDITS_500000 = "1599";
const USD_SKINS = "499";
const USD_STYLES = "499";
const USD_SUPER_WEAPONS = "1499";

//Steam bundle IDs
const BUNDLE_ASSAULT = 1;

const SOCKET_TYPE_GAME = "game";                    //Clients connected in game
const SOCKET_TYPE_WEB = "web";                      //Clients connected to web (account manager webpage)
const MAX_LEVEL = 50;                               //Max player level
const MAX_PRESTIGE = 10;                            //Max player prestige level

log(chalk.bgBlue("Arsenal Online | Account Server"));
var serverStartTime = Date.now();
log("Started:", (new Date(serverStartTime).toString()));
log(settings);

//Modules
log(chalk.yellow("Loading modules..."));
const { exec } = require("child_process");
const fs = require("fs");
const hathora = require("@hathora/hathora-cloud-sdk");
const saltRounds = 10;
const Int64 = require("node-int64");
const https = require("https");
const axios = require("axios");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const server = require("http").Server(app);
const path = require("path");
const bcrypt = require("bcrypt");
const customParser = require("socket.io-json-parser");
const { Server } = require("socket.io");
const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    parser: customParser,
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
    host: auth.email?.host,
    secureConnection: false,
    port: auth.email?.host || 465,
    auth: {
        user: auth.email?.user,
        pass: auth.email?.pass
    },
    tls: {
        ciphers: "SSLv3",
		rejectUnauthorized: false
    }
});
const { RateLimiterMemory } = require("rate-limiter-flexible");
const chatLimiter = new RateLimiterMemory({
    points: 5,
    duration: 5
});
const crypto = require("crypto");
const fetch = require("node-fetch");
const smile = require("smile2emoji");
const weapons = require("./json/weapons.json");
const mods = require("./json/mods.json");
const anims =  require("./json/anims.json");
log(chalk.green("Done"));

//Initialization
var chatHistory = [];
var interval = setInterval(() => {
    onInterval();
}, 1000);
initChallenges();

function initChallenges()
{
    log("Initialize challenges...");
    var types = [
        "daily",
        "weekly"
    ];
    for (var i = 0; i < types.length; i ++)
    {
        let type = types[i]; 
        let challenge = challenges[type];       
        if (!challenge || Date.now() > challenge.endDate)
        {
            clearChallenge(type);
            generateChallenges(type);            
        }
        else 
        {
            log(chalk.green("Use existing", type, "challenges"));
        }
    }
}

function onInterval()
{
    try
    {
        if (challenges)
        {
            var bSaveChallenges = false;
            var keys = Object.keys(challenges);
            for (var i = 0; i < keys.length; i ++)
            {
                let key = keys[i];
                let data = challenges[key];
                if (Date.now() > data.endDate)
                {
                    //Challenges expired
                    log("Challenges expired:", key);
                    bSaveChallenges = true;
                    clearChallenge(key);
                    generateChallenges(key);
                    io.emit("onUpdateChallenges", challenges[key]);                    
                }
            }
            if (bSaveChallenges)
            {
                saveChallengesToFile();
            }
        }
    }
    catch(e)
    {
        console.warn(e);
    }
}

//App
app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type");
    res.setHeader("Access-Control-Allow-Credentials", true);
    next();
});
app.use(express.static(__dirname + "/public_html"));
app.get("/", (request, response) =>
{
	var str = "<head>";    
    str += "<link rel='shortcut icon' href='./favicon.ico' />";
    str += '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Martian+Mono&family=Orbitron:wght@700&family=Plus+Jakarta+Sans&display=swap" rel="stylesheet"><link href="./assets/css/style.css" rel="stylesheet"></link>';
    str += "<link href='./styles/server.css' rel='stylesheet'>";
    str += "<title>[Arsenal Online] Account Server</title></head><body><img src='http://xwilkinx.com/play/arsenal/latest/assets/images/ui/logo.png' width='300'><h3>ACCOUNT SERVER</h3>";
    str += "<b>" + getNumClients() + "</b> connected";
    str += "<hr>";    
    var upTime = convertMS(Date.now() - serverStartTime);
    str += "<b>Uptime:</b> " + upTime.day + "d " + upTime.hour + "h " + upTime.minute + "m " + upTime.seconds + "s<br>";
    if (chatHistory)
    {
        str += "<h2>Chat</h2>";
        if (chatHistory.length)
        {
            for (var i = 0; i < chatHistory.length; i ++)
            {
                let chat = chatHistory[i];
                str += Date(chat.date).toString() + " | " + chat.playerText + (chat.username ? ("[" + chat.username + "]") : "") + ": " + chat.messageText + (i < chatHistory.length - 1 ? "<br>" : "");
            }
        }
        else 
        {
            str += "None";
        }
    }
	if (request.query.showPlayers == true)
    {
        var clients = getClients();
        if (clients.length > 0)
        {
            str += "<h2>Players</h2>";
            str += "<table style='width:100%'><tr><th>ID</th><th>Username</th><th>Name</th><th>Steam ID</th><th>State</th><th>Menu</th><th>Location</th><th>Device</th><th>Time Online</th>";
            if (request.query.ip == true)
            {
                str += "<th>IP</th>"
            }
            str += "</tr>";
            for (let i = 0; i < clients.length; i++)
            {
                let client = clients[i];
                if (client)
                {
                    str += "<tr><td>[" + i + "] " + client.id + "</td>";                    
                    let username = client.username ? client.username : "-";
                    let nameStr = username;
                    if (client.bAdmin) nameStr += " [Admin]";
                    if (client.bModerator) nameStr += " [Moderator]";
                    if (client.bMuted) nameStr += " [Muted]";
                    str += "<td>" + nameStr + "</td>";
                    str += "<td>" + (client.name ? client.name : "-") + "</td>";
                    str += "<td>" + (client.steamId ? ("<a href='https://steamcommunity.com/profiles/" + client.steamId + "'>" + client.steamId + "</a>") : "-") + "</td>";
                    str += "<td>" + (client.state ? client.state : "-") + "</td>";
                    str += "<td>";
                    str += client.bInGame ? (client.gameModeId ? (client.gameModeId) : "In Game") : (client.menu ? client.menu : "-");
                    str += "</td>";
                    str += "<td>" + (client.href ? client.href : "-") + "</td>";
                    str += "<td>" + (client.bMobile ? "Mobile" : "Desktop") + "</td>";
                    str += "<td>";
                    str += (client.date ? GameUtil.ConvertToTimeString((Date.now() - client.date) / 1000) : "");                    
                    str += "</td>";
                    if (request.query.ip == true)
                    {
                        str += "<td>" + client.ip + "</td>"
                    }
                    str += "</tr>";
                }
            }    
        }
    }
    str += "</body>";
    response.send(str);
});

app.get("/reset", limiter, async (request, response) =>
{
    var token = request.query.token;
    if (token)
    {
        const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
        try 
        {            
            const db = client.db("arsenal");
            let collection = db.collection("accounts");   
            let query = {
                resetToken: { $eq: token }
            };
            let res = await collection.findOne(query);
            if (res)
            {
                if (Date.now() < res.resetTokenExpiry)
                {
                    response.sendFile(path.join(__dirname + "/reset/reset.html"));
                }
                else 
                {
                    response.send("Token expired");
                }
            }
            else 
            {
                response.send("Invalid token");
            }
        }
        catch(e)
        {
            console.warn(e);
            response.send("An error occurred");
        }
        finally
        {
            client.close();
        }
    }
    else 
    {
        response.send("Invalid parameters");
    }
});

app.post("/reset", bodyParser.json(), limiter, async (request, response) => 
{
    log(request.body);
    var password = request.body.password;
    var token = request.body.token;
    if (token && password)
    {
        const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
        try 
        {            
            const db = client.db("arsenal");
            let collection = db.collection("accounts");   
            let query = {
                resetToken: { $eq: token }
            };	     
            var salt = bcrypt.genSaltSync(saltRounds);
            var hash = bcrypt.hashSync(password, salt);
            let res = await collection.findOneAndUpdate(
                query,
                {
                    $set: {
                        password: hash,
                    },
                    $unset: {
                        resetToken: "",
                        resetTokenExpiry: ""
                    }
                }
            );
            if (res)
            {
                log("Password updated:", chalk.yellow(hash));
                response.send("OK");
            }
            else 
            {
                response.send("Error");
            }
        }
        catch(e)
        {
            console.warn(e);
        }
        finally
        {
            client.close();
        }
    }
    else 
    {
        response.send("Error");
    }
});

app.get("/settings", (request, response) =>
{
    response.send(settings);
});

//Xsolla webhooks
app.post("/xsolla", bodyParser.json(), limiter, async (req, res) => 
{
    log(chalk.bgCyan("Xsolla"));
    log("Request body: %s", JSON.stringify(req.body), req.headers.authorization);
    var status = 204;
    switch (req.body.notification_type)
    {
        case "payment":
            break;
        case "order_paid":
            break;
        case "order_canceled":
            break;
    }
    var str = JSON.stringify(req.body);
    str += XSOLLA_API_KEY;
    var hash = crypto.createHash("sha1").update(str).digest("hex");
    log("Hash:", hash);
    res.status(status).send(escape(str));
});

//API

app.get("/api/getBanned", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    response.send(banned);     
});

app.get("/api/getTopScores", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    var players;
    var query = {
        id: request.query.gameModeId
    };
    await queryScores(query, (_res) => {
        players = _res;
    });
    response.send(players);     
});

app.get("/api/getTopPlayers", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    await getTopPlayers((_res) => {
        players = _res;
    });
    response.send(players); 
});

app.get("/api/getPlayerData", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    var player;
    await getPlayerData(request.query.username, (_res) => {
        player = _res;
    });
    response.send(player ? player : "Player doesn't exist"); 
});

app.get("/api/getOnlinePlayers", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    var players = getGameClients();
    response.send(players); 
});

app.get("/api/getWeaponData", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    var wpn = getWeaponData(request.query.weaponId);
    response.send(wpn ? wpn : "Invalid weapon id"); 
});

app.get("/api/getModData", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    var mod = getModData(request.query.modId);
    response.send(mod ? mod : "Invalid mod id"); 
});

app.get("/api/getWeapons", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    response.send(weapons); 
});

app.get("/api/getMods", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    response.send(mods); 
});

app.get("/api/getGameModes", async (request, response) => 
{
    log(chalk.cyan("API"), request.url);
    response.send(Object.keys(GameMode)); 
});

server.listen(process.env.PORT || settings.port || 9101, () =>
{
    const line = "---------------------------------------------------------------";
    log(line);
    log(chalk.green("Success!") + "\nArsenal Online Server is running on port " + chalk.green(server.address().port));
    log("For more info, visit " + chalk.magenta("https://wilkingames.com"));
    log(line);
});

io.on("connection", (socket) =>
{
    var ip = socket.request.connection.remoteAddress;
    log(logSocket(socket), chalk.green("connected"), ip);

    socket.data = {
        id: socket.id,
        date: Date.now(),
        ip: ip
    };

    socket.on("banPlayer", (_val) => 
    {
        if (socket.data.bAdmin || socket.data.bModerator)
        {
            if (banned)
            {
                banPlayer(_val);
            }
        }
    });

    socket.on("mutePlayer", (_val) => 
    {
        if (socket.data.bAdmin || socket.data.bModerator)
        {
            mutePlayer(_val);
        }
    });

    socket.on("getChatHistory", (_callback) => 
    {
        if (_callback)
        {
            _callback(chatHistory);
        }
    });

    socket.on("cancelInvite", (_data) => 
    {
        var hostSocket = getSocketsById(_data.hostId, SOCKET_TYPE_GAME)[0];
        if (hostSocket && hostSocket.data.bSearchingForGame)
        {
            hostSocket.emit("onInviteCancelled", { name: socket.data.name });
        }
    });

    socket.on("chat", (_message) => 
    {
        if (!socket.data)
        {
            return;
        }
        try
        {
            if (socket.data.bAdmin)
            {
                handleChatMessage(socket, _message);
            }
            else
            {
                chatLimiter.consume(socket.id).
                    then(() =>
                    {
                        handleChatMessage(socket, _message);
                    }).
                    catch(r =>
                    {
                        sendChatMessageToSocket(socket, {
                            bServer: true,
                            bDirect: true,
                            messageText: "You've sent too many messages."
                        });
                    });
            }
        }
        catch (e)
        {
            console.warn("Error while sending chat message:", e);
        }
    });

    socket.on("searchCoop", async (_data, _callback) => 
    {
        log(logSocket(socket), "search for co-op game", _data);
        try
        {
            if (settings.bUseHathora)
            {
                if (_data.inviteId)
                {
                    let res = await createHathoraLobby(socket, _data, _callback);
                    log("New invite lobby", res);
                }
                else 
                {
                    var items = await getHathoraLobbies();
                    log(items.length, "active lobbies");
                    if (items.length > 0)
                    {
                        //TODO Find best region
                        items.sort((a, b) => {
                            if (a.region == _data.region) return -1;
                            if (a.region != _data.region) return 1;
                            if (b.region == _data.region) return -1;
                            if (b.region != _data.region) return 1;
                            return 0;
                        });
                        _callback(items[0]);
                    }
                    else 
                    {
                        let res = await createHathoraLobby(socket, _data, _callback);
                        log("New lobby", res);
                    }
                }
            }
            else 
            {
                let url = settings.multiplayerURL ? settings.multiplayerURL : "https://arsenal-mp-us.wilkingames.net/";
                if (_data.inviteId)
                {
                    let invitedSocket = getSocketId(_data.inviteId, SOCKET_TYPE_GAME);
                    if (invitedSocket)
                    {
                        _callback({ url: url, inviteId: _data.inviteId });
                        log("Send URL to", invitedSocket.id); 
                        invitedSocket.emit("onInvite", { 
                            hostId: socket.id,
                            playerId: socket.data.id,
                            username: socket.data.username, 
                            name: socket.data.name, 
                            gameModeId: _data.gameModeId,
                            url: url 
                        });
                    }
                    else 
                    {
                        _callback({ message: "Player is unavailable." });
                    }
                }
                else 
                {
                    _callback({
                        url: url
                    });
                }
            }
        }
        catch(e)
        {
            console.warn(e);
        }
    });

    socket.on("getHathoraRegions", async (_callback) => 
    {
        log(logSocket(socket), "wants to get Hathora regions");
        try
        {
            let discovery = new hathora.DiscoveryV1Api();
            let arr = await discovery.getPingServiceEndpoints();
            _callback({ regions: arr });
        }
        catch(e)
        {
            console.warn(e);
            if (_callback) _callback({ message: e.message });
        }
    });

    socket.on("getHathoraRegionHost", async (_val, _callback) => 
    {
        log(logSocket(socket), "wants to get Hathora region host", _val);
        try
        {
            let discovery = new hathora.DiscoveryV1Api();
            let arr = await discovery.getPingServiceEndpoints();
            for (var i = 0; i < arr.length; i ++)
            {
                let region = arr[i];
                if (region.region == _val)
                {
                    _callback("https://" + region.host + ":" + region.port);
                    return;
                }
            }
            _callback(null);
        }
        catch(e)
        {
            console.warn(e);
        }
    });

    socket.on("cleanLeaderboards", async() => 
    {
        if (socket.data.bAdmin)
        {
            const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
            try 
            {
                const db = client.db("arsenal");
                let collection = db.collection("accounts");   
                let modes = Object.keys(GameMode);
                let res = await collection.find({ profile: { $ne: null}}).forEach(async (_item) => 
                {                   
                    if (_item && _item.profile)
                    { 
                        for (var i = 0; i < modes.length; i ++)
                        {
                            let id = modes[i].toLowerCase();  
                            if (_item.profile.bestScores)
                            {
                                let solo = _item.profile.bestScores[id];
                                submitScore(null, _item.username, { id: id, score: solo, bMultiplayer: false });
                            }
                            if (_item.profile.bestCoopScores)
                            {
                                let coop = _item.profile.bestCoopScores[id];
                                submitScore(null, _item.username, { id: id, score: coop, bMultiplayer: true });
                            }
                        }
                    }
                });
            }
            catch(e)
            {
                console.warn(e);
            }
            finally
            {
                client.close();
            }    
            return null;
        }
    });

    socket.on("sendEmail", async (_email) => 
    {
        if (socket.data.bAdmin)
        {
            //Send email
            var mailOptions = {
                from: "contact@wilkingames.com",
                to: _email,
                subject: "Arsenal Online - Test",
                text: "",
                html: getEmailTemplate({
                    id: "generic"
                })
            };
            let info = await transporter.sendMail(mailOptions, (err, info) =>
            {
                if (err)
                {
                    console.warn(err);
                    return ("Error while sending email: " + err);
                }
                else 
                {
                    log("Email sent");
                    return ("Email sent");
                }
            });
        }
    });

    socket.on("resetChallenges", (_val) => 
    {
        if (socket.data.bAdmin)
        {
            switch (_val)
            {
                case "daily":
                case "weekly":
                    clearChallenge(_val);
                    generateChallenges(_val); 
                    break;
                default:
                    clearChallenges();
                    initChallenges();
                    break;
            }            
        }
        else 
        {
            console.warn("Access denied!");
        }
    });

    socket.on("addCredits", (_username, _val) => 
    {
        if (socket.data.bAdmin)
        {
            if (_username)
            {
                var receiver = getSocketByUsername(_username, SOCKET_TYPE_GAME);            
                addCredits(receiver, _username, _val);                
            }
        }
        else 
        {
            console.warn("Access denied!");
        }
    });

    socket.on("addItem", (_username, _id, _referral) => 
    {
        log(logSocket(socket), "Add item", chalk.cyan(_id), chalk.yellow(_username));
		if (!_id || typeof _id !== "string")
		{
			socket.emit("onOrderResult", {
				bSuccess: 0,
				message: "Invalid item id: " + _id
			});
			return;
		}
        var username = _username ? _username : (socket.data ? socket.data.username : null);
		if (!username)
		{
			socket.emit("onOrderResult", {
				bSuccess: 0,
				message: "Invalid username"
			});
			return;
		}		
        var item = getSteamItem(_id);
        log(item);
        if (item)
        {
            if (_referral)
            {
                item.referral = _referral;
            }
            if (item.bundleId)
            {
                addBundle(socket, username, item);
            }
            if (item.numCredits)
            {
                addCredits(socket, username, item.numCredits, item);
            }
        }
        else 
        {
            socket.emit("onOrderResult", {
                bSuccess: 0,
                message: "Unhandled item id: " + _id
            });
        }
    });

    socket.on("login", (_username, _password, _type) =>
    {
        log(logSocket(socket), "Wants to login:", chalk.yellow(_username), chalk.green(_type));
        requestLogin(socket, _username, _password, _type);
    });

    socket.on("logout", () =>
    {
        log(logSocket(socket), "Wants to logout");
        onPlayerUpdated(socket.data);
        delete socket.data.username;
        delete socket.data.bAdmin;
        socket.emit("onLogout");
    });

    socket.on("register", (_username, _password, _email, _data) =>
    {
        log(logSocket(socket), "Wants to register:", _username, "[REDACTED]", _email);
        requestRegister(socket, _username, _password, _email, _data);
    });

    socket.on("connectData", () =>
    {
        requestConnectData(socket);
        socket.emit("onGetChallenges", challenges);
    });

    socket.on("completeChallenge", (_id) =>
    {
        if (challenges)
        {
            
        }
    });

    socket.on("update", (_data) =>
    {        
        if (_data)
        {
            //log(logSocket(socket), "Update", Object.keys(_data).length, "keys", _data);
            var data = socket.data;
            for (var key in _data)
            {
                let val = _data[key];
                switch (key)
                {
                    case "type":
                    case "href":
                    case "name":
                    case "serverURL":
                    case "serverName":       
                    case "gameModeId":
                    case "scenario":
                    case "level":
                    case "prestige":
                    case "state":
                    case "menu":
                    case "xp":
                    case "bMobile":
                        data[key] = val;
                        break;
                    case "lobbyId":  
                        data[key] = val;
                        if (val)
                        {
                            let sockets = getSocketsInLobby(val);
                            for (var i = 0; i < sockets.length; i ++)
                            {
                                let s = sockets[i];
                                if (s.id != socket.id)
                                {
                                    socket.emit("onPlayedWith", {
                                        username: s.data.username,
                                        steamId: s.data.steamId                                        
                                    });
                                }
                            }
                        }
                        break;
                    case "bInGame":
                    case "bSearchingForGame":
                        data[key] = val;
                        if (!val)
                        {
                            delete data.gameModeId;
                        }
                        break;
                    case "steamId":
                        if (val && !data[key] && socket.data.username)
                        {
                            setPlayerSteamId(socket.data.username, val);
                        }
                        data[key] = val;                        
                        break;
                    default:
                        log("Ignore key", key);
                        break;  
                }
            }       
            onPlayerUpdated(data);
        }
    });

    socket.on("save", (_data) =>
    {
        try
        {
            if (!_data || !Object.keys(_data))
            {
                return;
            }
            log(logSocket(socket), "Save data", JSON.stringify(_data).length / 1000, "kb");
            if (socket.data)
            {
                savePlayerData(socket, socket.data.username, _data);
            }
            else 
            {
                console.warn("Invalid socket data");
            }
        }
        catch(e)
        {
            console.warn(e);
        }
    });

    socket.on("getOnlinePlayers", (_callback) => 
    {
        log(logSocket(socket), "Get online players");
        if (_callback)
        {
            _callback(getGameClients());
        }
    });

    socket.on("getTopPlayers", async (_callback) => 
    {
        log(logSocket(socket), "Get top players");
        getTopPlayers(_callback);
    });

    socket.on("forgotPassword", (_username) =>
    {
        log(logSocket(socket), "Forgot password:", chalk.yellow(_username));
        if (socket.data)
        {
            requestPasswordReset(socket, _username);
        }
    });

    socket.on("joinGame", async (_data, _callback) => 
    {
        log(logSocket(socket), "wants to join game", _data);
        try
        {
            let appId = HATHORA_APP_MULTIPLAYER;
            let region = _data.region ? _data.region : hathora.Region.Seattle;

            let authClient = new hathora.AuthV1Api();           

            log("Checking active lobbies...");
            let lobbyClient = new hathora.LobbyV2Api();
            let roomClient = new hathora.RoomV1Api();   
            const publicLobbies = await lobbyClient.listActivePublicLobbies(appId);
            log(publicLobbies.length, "lobbies found");
            if (publicLobbies.length > 0)
            {
                var lobby = publicLobbies[0];
                log(chalk.green("Join active lobby"));                
            }
            else 
            {
                log("Generating player token...");
                let { token } = await authClient.loginAnonymous(appId);     
                lobby = await lobbyClient.createLobby(
                    appId,
                    token,
                    {
                        visibility: "public",
                        region: region,
                        initialConfig: {},
                    }
                );
            }
            if (lobby)
            {
                log(lobby);            
                log("Get connection info...");
                let counter = 0;
                let interval = setInterval(async () => {
                    let connectionInfo = await roomClient.getConnectionInfo(appId, lobby.roomId);
                    let status = connectionInfo.status;
                    log(status);
                    if (status == "active")
                    {                     
                        clearInterval(interval);
                        log(connectionInfo);
                        _callback({ url: "https://" + connectionInfo.host + ":" + connectionInfo.port + "/" });
                    }
                    else if (status == "destroyed")
                    {
                        clearInterval(interval);
                        socket.emit("onJoinGame", { message: "Game destroyed" });
                    }
                    else 
                    {
                        socket.emit("onJoinGame", { status: status });
                    }
                    counter++;
                    if (counter > 60)
                    {
                        clearInterval(interval);
                    }
                }, 1000);
            }
            else 
            {
                console.warn("Invalid lobby");
                _callback({ message: "Invalid lobby"});
            }
        }
        catch(e)
        {
            log("Error while trying to join game");
            console.warn(e);
            _callback({ message: e.message });
        }
    });

    socket.on("finalizeSteamItem", (_data) =>
    {
        log(logSocket(socket), "Finalize Steam item:", _data);
        if (_data)
        {
            var url = STEAM_URL_TXN + "/FinalizeTxn/v2/" + "?key=" + STEAM_PUBLISHER_KEY;
            var str = "";
            str += "&orderid=" + _data.orderId;
            str += "&appid=" + STEAM_APP_ID;
            axios.post(url, str).then(res => {
                log(res.data);  
                finalizeOrder(socket, res.data.response);   
                if (res.data.response.result == "OK")
                {
                    //finalizeOrder(socket, res.data.response.params.orderid);                  
                }    
                else 
                {
                    socket.emit("onOrderResult", {
                        bSuccess: 0
                    });
                }                
            }).catch(e => {
                console.error(e.message);
            });
        }
    });
	
	socket.on("buySteamItem", (_data) =>
	{
		log(logSocket(socket), "Buy Steam item:", _data);
		if (_data)
		{
            let player = socket.data;
            let steamId = player.steamId ? player.steamId : _data.steamId;
            if (!steamId)
            {
                console.warn("Invalid Steam ID");
				socket.emit("onOrderResult", {
					bSuccess: 0,
					message: "Invalid Steam ID"
				});
                return;    
            }
            let item = getSteamItem(_data.id);
            if (!item)
            {
                console.warn("Invalid Steam item");
				socket.emit("onOrderResult", {
					bSuccess: 0,
					message: "Invalid Steam item"
				});
                return;                
            }
			https.get(STEAM_URL_TXN + "/GetUserInfo/v2/" + "?key=" + STEAM_PUBLISHER_KEY + "&steamid=" + steamId, (resp) => {
                let data = "";
                resp.on("data", (chunk) => {
                    data += chunk;
                });
                resp.on("end", () => {
                    let json = JSON.parse(data);
                    log(json);
                    let url = STEAM_URL_TXN + "/InitTxn/v3/" + "?key=" + STEAM_PUBLISHER_KEY;
                    let orderId = new Int64(Math.round(Math.random() * 1000000000)).toString();
                    let params = {
                        orderid: orderId,
                        steamid: steamId,
                        appid: STEAM_APP_ID,
                        itemcount: 1,
                        language: "en",
                        currency: CURRENCY //json.response.params.currency
                    };
                    let str = "";
                    let keys = Object.keys(params);
                    for (let i = 0; i < keys.length; i ++)
                    {
                        str += "&" + keys[i] + "=" + params[keys[i]];
                    }
                    str += "&itemid[0]=" + item.steamItemId;
                    str += "&qty[0]=1";
                    str += "&amount[0]=" + item.amount;
                    str += "&description[0]=" + item.description;
                    axios.post(url, str).then(res => {
                        log(res.data);
                        createOrder({
                            id: item.id,
                            orderId: orderId,
							amount: item.amount,
                            username: socket.data.username,
                            steamId: _data.steamId
                        });
                    }).catch(e => {
                        console.error(e.message);
                    });
                })
			});
		}
	});

    socket.on("submitScore", (_data) => 
    {
		if (_data)
		{
            switch (_data.id)
            {
                case GameMode.DEFENDER:
                case GameMode.HARDENED:
                case GameMode.LAVA:
                case GameMode.REFLEX:
                case GameMode.SHOOTER:
                case GameMode.SNIPER:
                case GameMode.TIME_ATTACK:
                case GameMode.WAR: 
                case GameMode.BREACH: 
                case "kills":
                case "xp":
                    submitScore(socket, socket.data.username, _data);
                    break;
                default:
                    console.warn("Unhandled submission:", _data.id);
                break;
            }			
		}
	});
	
	socket.on("getScores", async (_id, _callback) => 
    {
        log(logSocket(socket), "Get scores", chalk.yellow(_id), _callback);
		if (_id)
		{
            if (_callback)
            {
                var players = await getScores(null, _id);
                _callback(players);
            }
            else 
            {
			    getScores(socket, _id);
            }
		}
	});

    socket.on("queryScores", async (_query, _callback) => 
    {
        log(logSocket(socket), "Query scores");
        queryScores(_query, _callback);
	});

    socket.on("disconnect", () => 
    {
        log(logSocket(socket), chalk.red("disconnected"));
        onPlayerDisconnect(socket.data);
    });

});

function getClients()
{
    var arr = [];
    for (const [_, socket] of io.of("/").sockets)
    {
        arr.push(socket.data);
    }
    return arr;
}

function getGameClients()
{
    var arr = [];
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.data.type == SOCKET_TYPE_GAME)
        {
            arr.push(socket.data);
        }
    }
    return arr;
}

function getNumClients()
{
    var num = 0;
    io._nsps.forEach((namespace) =>
    {
        num += namespace.sockets.size;
    });
    return num;
}

function getSocketByUsername(_username, _type)
{
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.data && socket.data.username == _username)
        {
            if (!_type || socket.data.type == _type)
            {
                return socket;
            }
        }
    }
    return null;
}

function getSocketsInLobby(_lobbyId)
{
    var arr = [];
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.data && socket.data.lobbyId == _lobbyId)
        {
            arr.push(socket);
        }
    }
    return arr;
}

function getSocketsBySteamId(_val)
{
    var arr = [];
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.data && socket.data.steamId == _val)
        {
            arr.push(socket);
        }
    }
    return arr;
}

function getSocketId(_id)
{
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.id == _id)
        {
            return socket;
        }
    }
    return null;
}

function getSocketsByUsername(_val, _type)
{
    var arr = [];
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.data && socket.data.username == _val)
        {
            if (!_type || _type == socket.data.type)
            {
                arr.push(socket);
            }
        }
    }
    return arr;
}

function getSocketsById(_val, _type)
{
    var arr = [];
    for (const [_, socket] of io.of("/").sockets)
    {
        if (socket.data && socket.data.id == _val)
        {
            if (!_type || _type == socket.data.type)
            {
                arr.push(socket);
            }
        }
    }
    return arr;
}

function mutePlayer(_val)
{
    var mutedSocket = getSocketsById(_val)[0] || getSocketByUsername(_val);
    if (mutedSocket)
    {
        if (!mutedSocket.data.bAdmin && !mutedSocket.data.bModerator)
        {
            mutedSocket.data.bMuted = !mutedSocket.data.bMuted;
            sendChatMessageToAll({
                bServer: true,
                messageText: mutedSocket.data.name + (mutedSocket.data.bMuted ? " has been muted" : " has been unmuted")
            });
        }
    }
}

function banPlayer(_val)
{
    var index = banned.indexOf(_val);
    if (index >= 0)
    {
        banned.splice(index, 1);
        sendChatMessageToAll({
            bServer: true,
            messageText: _val + " has been unbanned"
        });
    }
    else 
    {
        banned.push(_val);
        sendChatMessageToAll({
            bServer: true,
            messageText: _val + " has been banned"
        });
    }
    saveBannedToFile();
}

function logSocket(_socket)
{
    var data = _socket.data;
    var name = data.name ? data.name : _socket.id;
    if (data.username)
    {
        name += "[" + data.username + "]";
    }
    return chalk.yellow(name) + " |";
}

function isAdmin(_username)
{
    return settings.admins ? settings.admins.indexOf(_username) >= 0 : false;
}

function isModerator(_username)
{
    return settings.moderators ? settings.moderators.indexOf(_username) >= 0 : false;
}

function isOnline(_username)
{
    return getSocketByUsername(_username, SOCKET_TYPE_GAME) != null;
}

function isBanned(_val)
{
    if (banned)
    {
        return banned.indexOf(_val) >= 0;
    }
    return false;
}

function validateEmail(_email)
{
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(_email).toLowerCase());
}

function optimizeObject(_data)
{
    if (_data)
    {
        var keys = Object.keys(_data);
        for (var i = 0; i < keys.length; i ++)
        {
            let key = keys[i];
            let val = _data[key];
            if (typeof val === "boolean")
            {
                if (val == true)
                {
                    _data[key] = 1;
                }
                else 
                {
                    delete _data[key];
                }
            }
            else if (val == null)
            {
                delete _data[key];
            }
        }
    }
    return _data;
}

function onPlayerUpdated(_data)
{
    for (const [_, socket] of io.of("/").sockets)
    {
        let data = socket.data;
        if (data)
        {
            socket.emit("onPlayerUpdated", _data);
        }
    }
}

function onPlayerDisconnect(_data)
{
    for (const [_, socket] of io.of("/").sockets)
    {
        let data = socket.data;
        if (data)
        {
            socket.emit("onPlayerDisconnected", _data);
        }
    }
}

function convertMS(milliseconds)
{
    var day, hour, minute, seconds;
    seconds = Math.floor(milliseconds / 1000);
    minute = Math.floor(seconds / 60);
    seconds = seconds % 60;
    hour = Math.floor(minute / 60);
    minute = minute % 60;
    day = Math.floor(hour / 24);
    hour = hour % 24;
    return {
        day: day,
        hour: hour,
        minute: minute,
        seconds: seconds
    };
}

function clone(_data)
{
    return JSON.parse(JSON.stringify(_data));
}

function getEmailTemplate(_data)
{
    switch (_data.id)
    {
        case "newAccount":
            var html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
            <html>
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=us-ascii">
                </head>
                <body>
                    <div style="background-color:#f6f6f6;margin:0"> 
                    <table style="font-family:'akzidenz' , 'helvetica' , 'arial' , sans-serif;font-size:14px;color:#5e5e5e;width:98%;max-width:600px;float:none;margin:0 auto" border="0" cellpadding="0" cellspacing="0" valign="top" align="left">
                        <tbody>
                        <tr align="center">
                            <td style="padding-top:5px;padding-bottom:5px"> <a href="https://arsenalonline.net"><img src="https://xwilkinx.com/play/arsenal/latest/assets/images/ui/logo.png" width="100"></a> </td>
                        </tr>
                        <tr bgcolor="#ffffff">
                            <td> 
                            <table bgcolor="#ffffff" style="width:100%;line-height:20px;padding:32px;border:1px solid;border-color:#f0f0f0" cellpadding="0">
                                <tbody>
                                <tr>
                                    <td style="color:#3d4f58;font-size:24px;font-weight:bold;line-height:28px" align="center">Account Created</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center">A new Arsenal Online account was created using this email address.</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center"> <span id="verification-code" style="font-size:18px;font-weight:bold">${_data.username}</span> </td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center"> <a href="https://arsenalonline.net/account-manager">Account Manager</a></td>
                                </tr>
                                </tbody>
                            </table> </td>
                        </tr>
                        <tr>
                            <td align="center" style="font-size:12px;padding:24px 0;color:#999"> This message was sent from <a href="https://wilkingames.com">Wilkin Games</a></td>
                        </tr>
                        </tbody>
                    </table> 
                    </div>
                </body>
            </html>`;
            break;
        case "resetPassword":
            html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
            <html>
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=us-ascii">
                </head>
                <body>
                    <div style="background-color:#f6f6f6;margin:0"> 
                    <table style="font-family:'akzidenz' , 'helvetica' , 'arial' , sans-serif;font-size:14px;color:#5e5e5e;width:98%;max-width:600px;float:none;margin:0 auto" border="0" cellpadding="0" cellspacing="0" valign="top" align="left">
                        <tbody>
                        <tr align="center">
                            <td style="padding-top:5px;padding-bottom:5px"> <a href="https://arsenalonline.net"><img src="https://xwilkinx.com/play/arsenal/latest/assets/images/ui/logo.png" width="100"></a> </td>
                        </tr>
                        <tr bgcolor="#ffffff">
                            <td> 
                            <table bgcolor="#ffffff" style="width:100%;line-height:20px;padding:32px;border:1px solid;border-color:#f0f0f0" cellpadding="0">
                                <tbody>
                                <tr>
                                    <td style="color:#3d4f58;font-size:24px;font-weight:bold;line-height:28px" align="center">Reset Password</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center">Click the link to reset the password for <b>${_data.username}</b>:</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center"><a href="${_data.url}">${_data.url}</a></td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center">This link will expire in 1 hour.</td>
                                </tr>
                                </tbody>
                            </table> </td>
                        </tr>
                        <tr>
                            <td align="center" style="font-size:12px;padding:24px 0;color:#999"> This message was sent from <a href="https://wilkingames.com">Wilkin Games</a></td>
                        </tr>
                        </tbody>
                    </table> 
                    </div>
                </body>
            </html>`;
            break;
        case "purchase":
            html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
            <html>
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=us-ascii">
                </head>
                <body>
                    <div style="background-color:#f6f6f6;margin:0"> 
                    <table style="font-family:'akzidenz' , 'helvetica' , 'arial' , sans-serif;font-size:14px;color:#5e5e5e;width:98%;max-width:600px;float:none;margin:0 auto" border="0" cellpadding="0" cellspacing="0" valign="top" align="left">
                        <tbody>
                        <tr align="center">
                            <td style="padding-top:5px;padding-bottom:5px"> <a href="https://arsenalonline.net"><img src="https://xwilkinx.com/play/arsenal/latest/assets/images/ui/logo.png" width="100"></a> </td>
                        </tr>
                        <tr bgcolor="#ffffff">
                            <td> 
                            <table bgcolor="#ffffff" style="width:100%;line-height:20px;padding:32px;border:1px solid;border-color:#f0f0f0" cellpadding="0">
                                <tbody>
                                <tr>
                                    <td style="color:#3d4f58;font-size:24px;font-weight:bold;line-height:28px" align="center">${_data.title}</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center">${_data.desc}</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:12px" align="center">Referral: ${_data.referral ? _data.referral : "None"}</td>
                                </tr>
                                </tbody>
                            </table> </td>
                        </tr>
                        <tr>
                            <td align="center" style="font-size:12px;padding:24px 0;color:#999"> This message was sent from <a href="https://wilkingames.com">Wilkin Games</a></td>
                        </tr>
                        </tbody>
                    </table> 
                    </div>
                </body>
            </html>`;
            break;
        case "generic":
            html = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
            <html>
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=us-ascii">
                </head>
                <body>
                    <div style="background-color:#f6f6f6;margin:0"> 
                    <table style="font-family:'akzidenz' , 'helvetica' , 'arial' , sans-serif;font-size:14px;color:#5e5e5e;width:98%;max-width:600px;float:none;margin:0 auto" border="0" cellpadding="0" cellspacing="0" valign="top" align="left">
                        <tbody>
                        <tr align="center">
                            <td style="padding-top:5px;padding-bottom:5px"> <a href="https://arsenalonline.net"><img src="https://xwilkinx.com/play/arsenal/latest/assets/images/ui/logo.png" width="100"></a> </td>
                        </tr>
                        <tr bgcolor="#ffffff">
                            <td> 
                            <table bgcolor="#ffffff" style="width:100%;line-height:20px;padding:32px;border:1px solid;border-color:#f0f0f0" cellpadding="0">
                                <tbody>
                                <tr>
                                    <td style="color:#3d4f58;font-size:24px;font-weight:bold;line-height:28px" align="center">${_data.title}</td>
                                </tr>
                                <tr>
                                    <td style="padding-top:24px;font-size:16px" align="center">${_data.desc}</td>
                                </tr>
                                </tbody>
                            </table> </td>
                        </tr>
                        <tr>
                            <td align="center" style="font-size:12px;padding:24px 0;color:#999"> This message was sent from <a href="https://wilkingames.com">Wilkin Games</a></td>
                        </tr>
                        </tbody>
                    </table> 
                    </div>
                </body>
            </html>`;
            break;
    }    
    return html;
}

//MongoDB
const { MongoClient } = require("mongodb");
const { connect } = require("http2");
const { json } = require("express");
const uri = "mongodb+srv://" + auth.mongodb?.user + ":" + auth.mongodb?.pass + "@cluster0.ecgzr.mongodb.net/?retryWrites=true&w=majority";

async function requestLogin(_socket, _username, _password, _type)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");

        let query = {
            username: _username
        };
        let res = await collection.findOne(query);
        if (res)
        {
            if (bcrypt.compareSync(_password, res.password))
            {
                if (isBanned(res.username) || isBanned(res.steamId))
                {
                    _socket.emit("onLoginFailed", { message: "Banned", key: "STR_ERROR_BANNED" });
                }
                else 
                {
                    var bAdmin = isAdmin(res.username);
                    var bModerator = isModerator(res.username);
                    var existing = getSocketByUsername(res.username);
                    if (!bAdmin && existing && existing.data.type == _type)
                    {
                        _socket.emit("onLoginFailed", { message: "Already logged in", key: "STR_ERROR_ALREADY_LOGGED_IN" });
                    }
                    else 
                    {
                        _socket.data.username = res.username;                        
                        _socket.data.steamId = res.steamId;
                        _socket.data.type = _type;
                        if (res.profile)
                        {
                            _socket.data.name = res.profile.name;
                        }
                        if (bAdmin)
                        {
                            _socket.data.bAdmin = 1;
                        }
                        if (bModerator)
                        {
                            _socket.data.bModerator = 1;
                        }
                        //await savePlayerData(_socket, res.username, {});
                        _socket.emit("onLogin", {
                            username: res.username,
                            email: res.email,
                            messages: res.messages,
                            bAdmin: _socket.data.bAdmin,
                            bModerator: _socket.data.bModerator,
                            profile: res.profile,
                            date: res.date
                        });  
                    }    
                }   
            }
            else 
            {
                _socket.emit("onLoginFailed", { message: "Authentication failed", key: "STR_ERROR_AUTHENTICATION_FAILED" });
            }        
        }
        else 
        {
            _socket.emit("onLoginFailed", { message: "User doesn't exist", key: "STR_ERROR_USER_DOES_NOT_EXIST" });
        }
    }
    catch(e)
    {
        console.warn(e);
        _socket.emit("onLoginFailed", { message: "Error", key: "STR_ERROR_DESC" });
    }
    finally
    {
        client.close();
    }    
    return null;
}

async function requestRegister(_socket, _username, _password, _email, _data)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");
        let query = {
            username: _username
        };
        let res = await collection.findOne(query);
        if (res)
        {
            _socket.emit("onRegisterFailed", { message: "Username already in use", key: "STR_ERROR_USERNAME_TAKEN" });
        }
        else 
        {
			let res = await collection.findOne({
				email: _email
			});
			if (res)
			{
				_socket.emit("onRegisterFailed", { message: "Email already in use", key: "STR_ERROR_EMAIL_TAKEN" });
			}
			else 
			{
				if (_username.length < 3)
				{
					_socket.emit("onRegisterFailed", { message: "Invalid username", key: "STR_ERROR_INVALID_USERNAME" });
					return;
				}
				if (_password.length < 3)
				{
					_socket.emit("onRegisterFailed", { message: "Invalid password", key: "STR_ERROR_INVALID_PASSWORD" });
					return;
				}
				if (!validateEmail(_email))
				{
					_socket.emit("onRegisterFailed", { message: "Invalid email address", key: "STR_ERROR_INVALID_EMAIL" });
					return;
				}
				var salt = bcrypt.genSaltSync(saltRounds);
				var hash = bcrypt.hashSync(_password, salt);
                let json;
                if (typeof _data === "string")
                {
                    json = JSON.parse(_data);
                }
                else 
                {
                    json = _data;
                }
				let query = { 
					username: _username,
					password: hash,
					email: _email,
                    profile: json,
					date: Date.now(),
                    createDate: Date.now()
				};
				let insertRes = await collection.insertOne(query);
				if (insertRes)
				{
                    if (_socket.data.href && _socket.data.href.indexOf("centarius") >= 0)
                    {
                        centariusPost("https://www.centarius.app/reg-user/", { userID: _username });
                    }
					_socket.data.username = _username;
					_socket.emit("onRegister", {
						username: _username,
						email: _email
					});
					//Send email
					var mailOptions = {
						from: "contact@wilkingames.com",
						to: _email,
						subject: "Arsenal Online - " + _username,
                        text: "",
						html: getEmailTemplate({
                            id: "newAccount",
                            username: _username
                        })
					};
                    let info = await transporter.sendMail(mailOptions, (err, info) =>
					{
						if (err)
						{
							console.warn(err);
							return ("Error while sending email: " + err);
						}
						else 
						{
							log("Email sent");
							return ("Email sent");
						}
					});
				}
				else 
				{
					_socket.emit("onRegisterFailed", { message: "Error", key: "STR_ERROR_DESC" });
				}
			}
        }
    }
    catch(e)
    {
        console.warn(e);
        _socket.emit("onRegisterFailed", { message: "Error", key: "STR_ERROR_DESC" });
    }
    finally
    {
        client.close();
    }    
    return null;
}

async function requestPasswordReset(_socket, _username)
{    
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    const db = client.db("arsenal");
    let collection = db.collection("accounts");
    let res = await collection.findOne({ username: _username});
    if (!res)
    {
        _socket.emit("onForgotPassword", { bSuccess: 1 });  
        return;
    }
    log("Generating password token...");
    crypto.randomBytes(48, async (e, buffer) =>
    {    
        try 
        {
            let token = buffer.toString("hex");
            log(chalk.yellow(token));

            let query = {
                username: _username
            };            
            let res = await collection.findOneAndUpdate(
                query,
                {
                    $set: {
                        resetToken: token,
                        resetTokenExpiry: Date.now() + (1000 * 60 * 60)
                    }
                }
            );
            if (res)
            {
                let username = res.username;
                let email = res.email;
                fetch(URL_API).then((res) =>
                {
                    res.text().then((res) =>
                    {
                        let url = res + "reset/" + "?username=" + username + "&token=" + token;
                        log(url);
                        let mailOptions = {
                            from: "contact@wilkingames.com",
                            to: email,
                            subject: "Arsenal Online - Reset Password",
                            html: getEmailTemplate({
                                id: "resetPassword",
                                username: username,
                                url: url
                            })
                        };
                        transporter.sendMail(mailOptions, (err, info) =>
                        {
                            if (err)
                            {
                                console.warn(err);
                                return ("Error while sending email: " + err);
                            }
                            else 
                            {
                                return ("Email sent");
                            }
                        });  
                    });
                });                          
            }
            else 
            {
                log("No player exists with username", _username);
            }
            _socket.emit("onForgotPassword", { bSuccess: 1 });  
        }
        catch(e)
        {
            console.warn(e);
        }
        finally
        {
            client.close();
        }  
    }); 
}

async function requestConnectData(_socket)
{
	const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");		
        let res = await collection.estimatedDocumentCount();
        if (res)
        {
            _socket.emit("onConnect", { numAccounts: res } );
        }
	}
	catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }    
    return null;
}

async function savePlayerData(_socket, _username, _data)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");
        let query = {
            username: _username
        };
        let res = await collection.findOne(query);
        if (res)
        {
            if (!_data)
            {
                console.warn("Invalid player data", _data);
                _socket.emit("onUpdateDataFailed", { message: "Invalid player data", key: "STR_ERROR_DESC" });
                return;
            }
            let query = {
                username: _username,
            };     
            let update;  
            if (typeof _data === "object") 
            {
                if (_data.level > MAX_LEVEL)
                {
                    console.warn("Invalid level", _data.level, _username);
                    _socket.emit("onUpdateDataFailed", { message: "Invalid data", key: "STR_ERROR_DESC" });
                    return;
                }
                if (_data.prestige > MAX_PRESTIGE)
                {
                    console.warn("Invalid prestige", _data.prestige, _username);
                    _socket.emit("onUpdateDataFailed", { message: "Invalid data", key: "STR_ERROR_DESC" });
                    return;
                }
                let set = { 
                    date: Date.now(),
                    profile: _data
                };
                log("Save data for user", chalk.yellow(_username));
                update = {
                    $set: set
                };
                let updateRes = await collection.findOneAndUpdate(query, update);
                if (updateRes)
                {
                    if (_socket.data.href && _socket.data.href.indexOf("centarius") >= 0 || 1)
                    {
                        var score = updateRes.profile.stats.contestKills;
                        if (score > 0)
                        {
                            if (updateRes.username)
                            {
                                console.warn("Invalid username", updateRes.username, score);
                            }
                            kirusPost("https://dev.kirus.ai/enter-leaderboard/", {
                                userID: updateRes.username,
                                identity: updateRes.name,
                                score: score,
                                leaderboardID: "kills"
                            });
                            centariusPost("https://www.centarius.app/enter-leaderboard/", {
                                userID: updateRes.username,
                                score: score
                            });
                        }
                    }
                    _socket.emit("onUpdateData", {
                        username: updateRes.username
                    });
                    if (updateRes.profile)
                    {
                        _socket.data.name = updateRes.profile.name;
                    }
                }
                else 
                {
                    _socket.emit("onUpdateDataFailed", { message: "Error", key: "STR_ERROR_DESC" });
                }      
            }
            else 
            {
                console.warn("Invalid player data type", _data);
                _socket.emit("onUpdateDataFailed", { message: "Invalid player data type", key: "STR_ERROR_DESC" });
            }
        }
        else 
        {
            _socket.emit("onUpdateDataFailed", { message: "User doesn't exist", key: "STR_ERROR_USER_DOES_NOT_EXIST" });
        }
    }
    catch(e)
    {
        console.warn(e);
        _socket.emit("onUpdateDataFailed", { message: "Error", key: "STR_ERROR_DESC" });
    }
    finally
    {
        client.close();
    }   
}

async function setPlayerSteamId(_username, _steamId)
{
    if (!_steamId)
    {
        return;
    }
    log("Set player Steam ID", chalk.yellow(_username), _steamId);
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");
        let query = {
            username: _username
        };
        let res = await collection.findOne(query);
        if (res && !res.steamId != _steamId)
        {    
            let update = {
                $set: {
                    steamId: _steamId
                }
            };
            let res = await collection.findOneAndUpdate(query, update);
            if (res)
            {
                log("Set Steam ID", _steamId, "for", _username);
            }
        }
        else 
        {
            log("Username doesn't exist", _username);
        }
    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }   
}

async function getScores(_socket, _id)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("leaderboards");
		let players = [];
        let query = {
            gameModeId: _id            
        };	
        let res = await collection.find(query).sort({score: -1}).limit(10).forEach((_item) => 
		{            
			players.push({
				id: _item.id,
				username: _item.username,
				name: _item.name,
				score: _item.score,
				date: _item.date
			});
		});
        collection = db.collection("accounts");
        for (let i = 0; i < players.length; i ++)
        {          
            let curPlayer = players[i]; 
            if (isBanned(curPlayer.username) || isBanned(curPlayer.steamId))
            {
                continue;
            }
            query = {
                username: curPlayer.username
            };
            res = await collection.findOne(query);
            if (res)
            {          
                let json = res.profile;
                if (json)
                {
                    curPlayer.player = {
                        name: json.name,
                        level: json.level,
                        prestige: json.prestige
                    }
                }
                else 
                {
                    console.warn("Invalid player json for " + curPlayer.username);
                }
            }
        }
        if (players)
        {
            if (_socket) _socket.emit("onGetScores", { bSuccess: 1, players: players });              
        }
        else 
        {
            if (_socket) _socket.emit("onGetScores", { bSuccess: 0, message: "Error", key: "STR_ERROR_DESC" });
        }
        return players;
    }
    catch(e)
    {
        console.warn(e);
        if (_socket) _socket.emit("onGetScores", { bSuccess: 0, message: "Error", key: "STR_ERROR_DESC" });
    }
    finally
    {
        client.close();
    }    
    return null;
}

async function submitScore(_socket, _username, _data)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("leaderboards");   
        let username = _username;     
        if (!username)			
        {
            log("submitScore - Invalid username", username);
            if (_socket) _socket.emit("onSubmitScore", { message: "Invalid username", key: "STR_MUST_BE_LOGGED_IN" });
            return;
        }
        if (isBanned(username))
        {
            log("submitScore - Player is banned", username);
            if (_socket) _socket.emit("onSubmitScore", { message: "Player is banned", key: "STR_ERROR_BANNED" });
            return;
        }
        if (_socket && isBanned(_socket.data.ip))
        {
            log("submitScore - IP is banned", _socket.data.ip);
            if (_socket) _socket.emit("onSubmitScore", { message: "Player is banned", key: "STR_ERROR_BANNED" });
            return;
        }
		var query = {
            id: _data.id,
            username: username,
            bMultiplayer: _data.bMultiplayer == true
        }; 
        var score = _data.score ? Math.min(_data.score, 9999999999) : 0;
		let res = await collection.findOne(query);
		if (res)
		{           
			if (score > res.score)
			{
                //Update previous best
                log("Update score", _data.id, score, _data.name);
				let updateRes = await collection.updateOne(
					query,
					{
						$set: {
							steamId: _data.steamId,
							date: Date.now(),
							score: score,
                            bMultiplayer: _data.bMultiplayer == true
						}
					}
				);
				if (updateRes)
				{                    
					if (_socket) _socket.emit("onSubmitScore", { bSuccess: 1, message: "Score updated", key: "STR_SCORE_SUBMITTED" });      
				}
				else 
				{
					if (_socket) _socket.emit("onSubmitScore", { message: "Error", key: "STR_ERROR_DESC" });
				}
			}
		}
		else 
		{
            //New score
			log("Submit score", _data.id, score, username);
			let query = {
				id: _data.id,
				username: username,
				steamId: _data.steamId,
				score: score,
                bMultiplayer: _data.bMultiplayer == true,
				date: Date.now()
			};
			let res = await collection.insertOne(query);
			if (res)
			{
				if (_socket) _socket.emit("onSubmitScore", { bSuccess: 1, message: "Score submitted", key: "STR_SCORE_SUBMITTED" });      
			}
			else 
			{
				if (_socket) _socket.emit("onSubmitScore", { message: "Error", key: "STR_ERROR_DESC" });
			}
		}
    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }    
    return null;
}

//Xsolla
function xsollaPost(_url, _params)
{
    try
    {
        let str = "";
        str += "&game_id=" + CENTARIUS_ID;
        var keys = Object.keys(_params);
        for (var i = 0; i < keys.length; i ++)
        {
            let key = keys[i];
            str += "&" + key + "=" + _params[key];
        }
        log(chalk.cyan("Xsolla"), _url + str);
        axios.post(_url, str).then(res => {
            log(chalk.cyan("Xsolla"), res.data);               
        }).catch(e => {
            console.error(e.message);
        });
    }
    catch(e)
    {
        console.warn(e);
    }
}

//Centarius
function centariusPost(_url, _params)
{
    try
    {
        let str = "";
        str += "&game_id=" + CENTARIUS_ID;
        var keys = Object.keys(_params);
        for (var i = 0; i < keys.length; i ++)
        {
            let key = keys[i];
            str += "&" + key + "=" + _params[key];
        }
        log(chalk.cyan("Centarius"), _url + str);
        axios.post(_url, str).then(res => {
            log(chalk.cyan("Centarius"), res.data);               
        }).catch(e => {
            console.error(e.message);
        });
    }
    catch(e)
    {
        console.warn(e);
    }
}

//Kirus
function kirusPost(url, data)
{
    try
    {
        data.key = CENTARIUS_ID;
        axios.post(url, data).then(res => {
            log(chalk.cyan("Kirus"), res.data);               
        }).catch(e => {
            console.error(e.message);
        });
    }
    catch (e)
    {
        console.warn(e);
    }
}

//Challenges
function generateChallenges(_type)
{
    if (!challenges)
    {
        console.warn("Invalid challenge object");
        return;
    }
    log("Generate", _type, "challenges");
    challenges[_type] = {
        id: crypto.randomUUID().substring(0, 8),
        type: _type,
        items: []
    };
    var data = challenges[_type];
    data.startDate = Date.now();
    var tasks = [
        "kills",
        "headshots"
    ];
    switch (_type)
    {
        case "daily":            
            data.endDate = data.startDate + (1000 * 60 * 60 * 24);
            let dailyRewards = []
            if (MathUtil.Random(1, 10) == 1 || 1)
            {
                dailyRewards.push({
                    type: "money",
                    value: 100
                });
            }
            dailyRewards.push({
                type: "xp",
                value: 1000
            });
            data.items = [
                {
                    id: "daily_0",
                    type: _type,
                    name: "STR_CHALLENGE_DAILY_WIN",
                    desc: "STR_CHALLENGE_DAILY_WIN_DESC",
                    requirement: {
                        type: "games",
                        value: 1
                    },
                    rewards: dailyRewards
                }
            ];
            var rewards = [];            
            rewards.push({
                type: "money",
                value: MathUtil.RoundToNearest(MathUtil.Random(1000, 5000), 500)
            });                
            rewards.push({
                type: "xp",
                value: 5000
            });
            var dailyWeapon = {
                id: "daily_1",
                type: _type,
                requirement: {
                    type: MathUtil.RandomBoolean() ? "kills" : "headshots",
                    weaponId: getRandomWeaponId(),
                    value: MathUtil.RoundToNearest(MathUtil.Random(50, 500))
                },
                rewards: rewards
            };
            data.items.push(dailyWeapon);            
            rewards = [
                {
                    type: "money",
                    value: MathUtil.RoundToNearest(MathUtil.Random(1000, 5000), 500)
                },
                {
                    type: "xp",
                    value: MathUtil.RoundToNearest(MathUtil.Random(5000, 10000), 1000)
                }
            ];              
            if (MathUtil.RandomBoolean())
            {                    
                data.items.push({
                    id: "daily_3",
                    type: _type,
                    requirement: {
                        type: tasks[MathUtil.Random(0, tasks.length - 1)],
                        weaponCategory: getRandomWeaponCategory(),
                        value: MathUtil.RoundToNearest(50, 500)
                    },
                    rewards: rewards
                });  
            }
            else 
            {
                data.items.push({
                    id: "daily_2",
                    type: _type,
                    requirement: {
                        type: tasks[MathUtil.Random(0, tasks.length - 1)],
                        value: MathUtil.RoundToNearest(50, 500)
                    },
                    rewards: rewards
                });  
            }
            break;
        case "weekly":
            data.endDate = data.startDate + (1000 * 60 * 60 * 24 * 7);
            data.items = [];
            //Weekly wins
            var numWins = MathUtil.RoundToNearest(50, 100);
            data.items.push({
                id: "weekly_0",
                type: _type,
                requirement: {
                    type: "games",
                    value: numWins
                },
                rewards: [
                    {
                        type: "money",
                        value: Math.max(1000, numWins * 100)
                    },
                    {
                        type: "xp",
                        value: 5000
                    }
                ]
            });
            //Weekly kills
            var arr = [500, 1000, 1500, 2000, 2500, 5000, 10000];
            var numKills = arr[MathUtil.Random(0, arr.length - 1)];
            rewards = [];
            rewards.push({
                type: "money",
                value: MathUtil.RoundToNearest(Math.max(5000, numKills))
            });
            rewards.push({
                type: "xp",
                value: MathUtil.RoundToNearest(numKills * 10)
            });
            data.items.push({
                id: "weekly_1",
                type: _type,
                requirement: {
                    type: MathUtil.RandomBoolean() ? "kills" : "headshots",
                    value: numKills
                },
                rewards: rewards
            });
            //Weekly weapon kills
            arr = [500, 1000, 1500, 2000, 2500, 5000];
            numKills = arr[MathUtil.Random(0, arr.length - 1)];
            rewards = [];
            rewards.push({
                type: "money",
                value: MathUtil.RoundToNearest(Math.max(5000, numKills * 2), 500)
            });                
            rewards.push({
                type: "xp",
                value: MathUtil.RoundToNearest(numKills * 20)
            });
            data.items.push({
                id: "weekly_2",
                type: _type,
                requirement: {
                    type: MathUtil.RandomBoolean() ? "kills" : "headshots",
                    weaponId: getRandomWeaponId(),
                    value: numKills
                },
                rewards: rewards
            });
            //Weekly weapon type kills
            arr = [500, 1000, 1500, 2000, 2500, 5000];
            numKills = arr[MathUtil.Random(0, arr.length - 1)];
            rewards = [];
            rewards.push({
                type: "money",
                value: MathUtil.RoundToNearest(Math.max(5000, numKills * 2), 500)
            });                
            rewards.push({
                type: "xp",
                value: MathUtil.RoundToNearest(numKills * 20)
            });
            if (MathUtil.RandomBoolean())
            {
                numKills = arr[MathUtil.Random(0, arr.length - 1)];
                data.items.push({
                    id: "weekly_3",
                    type: _type,
                    requirement: {
                        type: MathUtil.RandomBoolean() ? "kills" : "headshots",
                        weaponCategory: getRandomWeaponCategory(),
                        value: numKills
                    },
                    rewards: rewards
                }); 
            }
            else 
            {
                numKills = arr[MathUtil.Random(0, arr.length - 1)];
                data.items.push({
                    id: "weekly_3",
                    type: _type,
                    requirement: {
                        type: MathUtil.RandomBoolean() ? "kills" : "headshots",
                        weaponType: getRandomWeaponType(),
                        value: numKills
                    },
                    rewards: rewards
                }); 
            }
            break;
    }
    log("Challenges generated", chalk.blue(data.type), data.endDate);
    io.emit("onUpdateChallenges", data);
    saveChallengesToFile();
}

function clearChallenges()
{
    log("Clear challenges");
    var types = Object.keys(challenges);
    for (var i = 0; i < types.length; i++)
    {
        let type = types[i];
        clearChallenge(type);
    }
}

function clearChallenge(_type)
{
    challenges[_type] = null;
}

function saveChallengesToFile()
{
    try
    {
        let str = JSON.stringify(challenges, null, "\t");
        fs.writeFile("challenges.json", str, (e) =>
        {
            if (e) 
            {
                console.warn(e);
                return;
            }
            log("Challenges written to file");
        });
    }
    catch(e)
    {
        console.warn(e);
    }
}

function saveBannedToFile()
{
    try
    {
        let str = JSON.stringify(banned, null, "\t");
        fs.writeFile("banned.json", str, (e) =>
        {
            if (e) 
            {
                console.warn(e);
                return;
            }
            log("Banned written to file");
        });
    }
    catch(e)
    {
        console.warn(e);
    }
}

function getRandomChallengeWeaponId()
{
    var arr = [];
    for (var i = 0; i < weapons.length; i++)
    {
        let wpn = weapons[i];
        if (wpn.bHidden || wpn.unlockLevel <= 1 || wpn.cost > 10000 || !getWeaponAnim(wpn.id))
        {
            continue;
        }
        arr.push(wpn);
    }
    return arr[MathUtil.Random(0, arr.length - 1)].id;
}

function getRandomWeaponId()
{
    var arr = [];
    for (var i = 0; i < weapons.length; i++)
    {
        let wpn = weapons[i];
        if (wpn.bHidden || !getWeaponAnim(wpn.id))
        {
            continue;
        }
        arr.push(wpn);
    }
    return arr[MathUtil.Random(0, arr.length - 1)].id;
}

function getRandomWeaponType()
{
    var arr = [
        "pistol",
        "machine_pistol",
        "smg",
        "shotgun",
        "sniper",
        "rifle",
        "lmg",
        "dmr",
        "launcher",
        "super"
    ];
    return arr[MathUtil.Random(0, arr.length - 1)];
}

function getRandomWeaponCategory()
{
    var arr = [
        "bBullpup",
        "bSingleRoundLoaded",
        "bBoltAction",
        "bPump"
    ];
    return arr[MathUtil.Random(0, arr.length - 1)];
}

function getWeaponData(_id)
{
    for (var i = 0; i < weapons.length; i ++)
    {
        if (weapons[i].id == _id)
        {
            return weapons[i];
        }
    }
    return null;
}

function getModData(_id)
{
    for (var i = 0; i < mods.length; i ++)
    {
        if (mods[i].id == _id)
        {
            return mods[i];
        }
    }
    return null;
}

function getWeaponAnim(_id)
{
    for (var i = 0; i < anims.length; i ++)
    {
        if (anims[i].id == _id)
        {
            return anims[i];
        }
    }
    return null;
}

function getSteamItem(_itemId)
{
    switch (_itemId)
    {
        case SteamItem.CREDITS_1:
            var numCredits = 1000;
            return {
                id: _itemId,
                steamItemId: 1,
                amount: USD_CREDITS_1000,
                description: numCredits + " Credits",
                numCredits: numCredits
            };
        case SteamItem.CREDITS_2:
            numCredits = 5000;
            return {
                id: _itemId,
                steamItemId: 2,
                amount: USD_CREDITS_5000,
                description: numCredits + " Credits",
                numCredits: numCredits
            };
        case SteamItem.CREDITS_3:
            numCredits = 10000;
            return {
                id: _itemId,
                steamItemId: 3,
                amount: USD_CREDITS_10000,
                description: numCredits + " Credits",
                numCredits: numCredits
            };
		case SteamItem.CREDITS_4:
            numCredits = 50000;
            return {
                id: _itemId,
                steamItemId: 4,
                amount: USD_CREDITS_50000,
                description: numCredits + " Credits",
                numCredits: numCredits
            };
		case SteamItem.CREDITS_5:
            numCredits = 100000;
            return {
                id: _itemId,
                steamItemId: 5,
                amount: USD_CREDITS_100000,
                description: numCredits + " Credits",
                numCredits: numCredits
            };
		case SteamItem.CREDITS_6:
            numCredits = 500000;
            return {
                id: _itemId,
                steamItemId: 6,
                amount: USD_CREDITS_500000,
                description: numCredits + " Credits",
                numCredits: numCredits
            };
        case SteamItem.BUNDLE_STYLES:
            return {
                id: _itemId,
                steamItemId: 7,
                bundleId: _itemId,
                amount: USD_STYLES,
                description: "Customization Bundle"
            };
        case SteamItem.BUNDLE_SUPER_WEAPONS:
            return {
                id: _itemId,
                steamItemId: 8,
                bundleId: _itemId,
                amount: USD_SUPER_WEAPONS,
                description: "Super Weapons Bundle"
            };
        case SteamItem.BUNDLE_SKINS:
            return {
                id: _itemId,
                steamItemId: 9,
                bundleId: _itemId,
                amount: USD_SKINS,
                description: "Skins Bundle"
            };
        default:
            console.warn("Unhandled Steam item", _itemId);
            break;
    }
    return null;
}

async function createOrder(_data)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("orders");
        log("Adding order", _data);
        let query = {
            id: _data.id,
            orderId: _data.orderId,
			amount: _data.amount,
            username: _data.username,
            steamId: _data.steamId,
            date: Date.now(),
            bFinalized: _data.bFinalized == true
        };
        let res = await collection.insertOne(query);
        if (res)
        {
            log("Order added successfully");		
        }
    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }    
    return null;
}

async function finalizeOrder(_socket, _response)
{
    const orderId = _response.params.orderid;
    const transactionId = _response.params.transid;
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("orders");
        log("Finalizing order", chalk.yellow(orderId));
        let query = {
            orderId: orderId
        };
        let res = await collection.findOneAndUpdate(
            query,
            {
                $set: {
                    bFinalized: true,
                    response: _response
                }
            }
        );
        if (res)
        {
            log("Order finalized", res);  
            if (_response.result == "OK")
            {
                log(chalk.green("Purchase success"));
                if (_socket)
                {
                    var item = getSteamItem(res.id);
                    _socket.emit("onOrderResult", {
                        bSuccess: 1,
                        id: res.id,
                        numCredits: item.numCredits,
                        bundleId: item.bundleId,
                        amount: res.amount,
                        currency: CURRENCY
                    });
                    var html = "";
                    if (res.numCredits)
                    {
                        html += "<p><b>" + res.numCredits + " Credits</b></p>";   
                    } 
                    html += "<p>Order #" + orderId + "<br>Steam ID: " + res.steamId + "<br>Username: " + res.username + "<br>Item: " + res.id + "<br>Amount: " + res.amount + "</p>";				
                    //Send email
                    var mailOptions = {
                        from: "contact@wilkingames.com",
                        to: "orders@xwilkinx.com",
                        subject: "[STEAM] Arsenal Online Transaction Completed",
                        html: html
                    };
                    transporter.sendMail(mailOptions, (err, info) =>
                    {
                        if (err)
                        {
                            console.warn(err);
                            return ("Error while sending email: " + err);
                        }
                        else 
                        {
                            log("Email sent");
                            return ("Email sent");
                        }
                    });
                }                   
            }
            else 
            {
                log(chalk.red("Purchase failed"));
            }
        }
        else 
        {
            console.warn("Error finalizing order");
        }
    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }    
    return null;
}

async function addBundle(_socket, _username, _bundleData)
{
    if (!_bundleData)
    {
        console.warn("Invalid bundle data", _bundleData)
        return;
    }
    log("Add", _bundleData.id, "to", chalk.yellow(_username));
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");
        let query = {
            username: _username,
            profile: { $ne: null }
        };
        let userRes = await collection.findOne(query);
        if (userRes)
        {
            if (userRes.profile)
            {
                let update = {
                    $push: {
                        "profile.bundles": _bundleData.id
                    }
                };     
                let res = await collection.findOneAndUpdate({ username: _username }, update);
                if (res)
                {

                    var sockets = getSocketsByUsername(res.username);
                    for (var i = 0; i < sockets.length; i ++)
                    {
                        let s = sockets[i];
                        let data = clone(_bundleData);
                        data.bundleId = _bundleData.id;
                        data.currency = CURRENCY;
                        data.referral = _bundleData.referral;
                        data.bWeb = 1;
                        data.bSuccess = 1;                        
                        log(i, data);
                        s.emit("onOrderResult", data);                    
                    }                
                    //Send email
                    var mailOptions = {
                        from: "contact@wilkingames.com",
                        to: res.email,
                        bcc: "orders@xwilkinx.com",
                        subject: "Arsenal Online - Bundle Added",
                        html: getEmailTemplate({id: "purchase", title: _bundleData.description + " Added", referral: _bundleData.referral, desc: `<b>${_bundleData.description}</b> has been added to your Arsenal Online account: <b>${res.username}</b><br><br>Thank you!`})
                    };
                    transporter.sendMail(mailOptions, (err, info) =>
                    {
                        if (err)
                        {
                            console.warn(err);
                            return ("Error while sending email: " + err);
                        }
                        else 
                        {
                            log("Email sent");
                            return ("Email sent");
                        }
                    });   
                    log("Referral:", _bundleData.referral);
                    if (_bundleData.referral)
                    {                        
                        if (_bundleData.referral.indexOf("centarius") >= 0)
                        {
                            centariusPost("https://www.centarius.app/enter-revenue/", { method: 2, amount: (parseInt(_bundleData.amount) / 100) });
                        }
                    }
                }          
            }
            else 
            {
                if (_socket) _socket.emit("onUpdateDataFailed", { message: "Error", key: "STR_ERROR_DESC" });
            }
        }
        else 
        {
            if (_socket) _socket.emit("onUpdateDataFailed", { message: "User doesn't exist", key: "STR_ERROR_USER_DOES_NOT_EXIST" });
        }

    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }   
}

async function addCredits(_socket, _username, _numCredits, _itemData = null)
{
    log("Add", _numCredits, "to", chalk.yellow(_username));
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("accounts");
        let query = {
            username: _username,
            profile: { $ne: null }
        };
        let userRes = await collection.findOne(query);
        if (userRes)
        {
            if (userRes.profile)
            {
                let update = {
                    $inc: {
                        "profile.money": _numCredits
                    }
                };     
                let res = await collection.findOneAndUpdate({ username: _username }, update);
                if (res)
                {
                    var sockets = getSocketsByUsername(res.username);
                    for (var i = 0; i < sockets.length; i ++)
                    {
                        let s = sockets[i];
                        let data = _itemData ? clone(_itemData) : {};
                        data.money = Math.max(0, res.profile.money + _numCredits);
                        data.numCredits = _numCredits;
                        data.currency = CURRENCY;
                        data.bWeb = 1;
                        data.bSuccess = 1;                        
                        log(i, data);
                        s.emit("onOrderResult", data);                    
                    }                
                    //Send email
                    var mailOptions = {
                        from: "contact@wilkingames.com",
                        to: res.email,
                        bcc: "orders@xwilkinx.com",
                        subject: "Arsenal Online - " + GameUtil.FormatNum(_numCredits) + " Credits Added",
                        html: getEmailTemplate({id: "purchase", title: "Credits Added", referral: _itemData.referral, desc: `<b>${GameUtil.FormatNum(_numCredits)} Credits</b> have been added to your Arsenal Online account: <b>${res.username}</b><br><br>Thank you!`})
                    };
                    transporter.sendMail(mailOptions, (err, info) =>
                    {
                        if (err)
                        {
                            console.warn(err);
                            return ("Error while sending email: " + err);
                        }
                        else 
                        {
                            log("Email sent");
                            return ("Email sent");
                        }
                    });
                    log("Referral:", _itemData.referral);   
                    if (_itemData.referral)
                    {
                        if (_itemData.referral.indexOf("centarius") >= 0)
                        {
                            centariusPost("https://www.centarius.app/enter-revenue/", { method: 2, amount: (parseInt(_itemData.amount) / 100) });
                        }
                    }
                }          
            }
            else 
            {
                if (_socket) _socket.emit("onUpdateDataFailed", { message: "Error", key: "STR_ERROR_DESC" });
            }
        }
        else 
        {
            if (_socket) _socket.emit("onUpdateDataFailed", { message: "User doesn't exist", key: "STR_ERROR_USER_DOES_NOT_EXIST" });
        }

    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }   
}

async function queryScores(_query, _callback)
{
    const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
    try 
    {
        const db = client.db("arsenal");
        let collection = db.collection("leaderboards");
        let players = [];
        let res = await collection.find(_query).sort({score: -1}).limit(100).forEach((_item) => 
        {                   
            if (_item && players.length < 20)
            { 
                for (let i = 0; i < players.length; i ++)
                {
                    if (players[i].username == _item.username)
                    {
                        return;
                    }
                }
                players.push({
                    id: _item.id,
                    username: _item.username,
                    name: _item.name,
                    score: _item.score,
                    date: _item.date,
                    bMultiplayer: _item.bMultiplayer == true
                });
            }
        });
        collection = db.collection("accounts");
        for (let i = 0; i < players.length; i ++)
        {          
            let curPlayer = players[i]; 
            if (isBanned(curPlayer.username) || isBanned(curPlayer.steamId))
            {
                continue;
            }
            let query = {
                username: curPlayer.username,
                profile: { $ne: null }
            };
            let player = await collection.findOne(query);
            if (player && player.profile)
            {         
                curPlayer.name = player.profile.name;
                curPlayer.level = player.profile.level;
                curPlayer.prestige = player.profile.prestige;
            }  
            else 
            {
                log("No profile data for", chalk.yellow(curPlayer.username));
            }          
        }
        if (_callback)
        {
            players.length = Math.min(players.length, 10);
            _callback(players);
        }
    }
    catch(e)
    {
        console.warn(e);
    }
    finally
    {
        client.close();
    }    
}

async function getTopPlayers(_callback)
{
    if (_callback)
    {
        const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
        try 
        {
            const db = client.db("arsenal");
            let collection = db.collection("accounts");
            let players = [];
            let res = await collection.find({}).sort({"profile.stats.kills": -1}).limit(10).forEach((_item) => 
            {                   
                if (_item && !isBanned(_item.username))
                { 
                    let profile = _item.profile;
                    players.push({
                        username: _item.username,
                        name: profile.name,
                        level: profile.level,
                        prestige: profile.prestige,
                        xp: profile.xp,
                        score: profile.stats.kills
                    });
                }
            });
            _callback(players);
        }
        catch(e)
        {
            console.warn(e);
        }
        finally
        {
            client.close();
        }    
    }
}

async function getPlayerData(_username, _callback)
{
    if (_callback)
    {
        const client = await MongoClient.connect(uri).catch(e => { console.warn(e) });
        try 
        {
            const db = client.db("arsenal");
            let collection = db.collection("accounts");
            let res = await collection.findOne({ username: { $eq: _username } });
            delete res.password;
            delete res.email;
            delete res._id;
            _callback(res);
        }
        catch(e)
        {
            console.warn(e);
        }
        finally
        {
            client.close();
        }    
    }
}

async function getHathoraLobbies()
{
    try
    {
        let appId = HATHORA_APP_MULTIPLAYER;
        let lobbyClient = new hathora.LobbyV2Api(); 
        let roomClient = new hathora.RoomV1Api(); 
        const publicLobbies = await lobbyClient.listActivePublicLobbies(appId);
        let items = [];
        for (var i = 0; i < publicLobbies.length; i ++)
        {
            let lobby = publicLobbies[i];
            let connectionInfo = await roomClient.getConnectionInfo(appId, lobby.roomId);
            if (connectionInfo.status == "active")
            {
                log(connectionInfo);
                items.push({
                    region: lobby.region,
                    config: lobby.initialConfig,
                    name: lobby.initialConfig.name,
                    url: "https://" + connectionInfo.host + ":" + connectionInfo.port + "/"
                });
            }
        }
        return items;
    }
    catch(e)
    {
        console.warn(e);
    }
    return [];
}

async function createHathoraLobby(_socket, _data, _callback)
{
    try 
    {
        let appId = HATHORA_APP_MULTIPLAYER;
        let region = _data.region ? _data.region : hathora.Region.WashingtonDc;

        let authClient = new hathora.AuthV1Api();

        log("Generating player token...");
        let { token } = await authClient.loginAnonymous(appId); //authClient.loginNickname(appId, { nickname: _socket.data.name }); 

        let lobbyClient = new hathora.LobbyV2Api();
        let roomClient = new hathora.RoomV1Api(); 

        let lobby = await lobbyClient.createLobby(
            appId,
            token,
            {
                visibility: "public",
                region: region,
                initialConfig: _data,
            }
        );
        if (lobby)
        {
            let num = 0;
            let interval = setInterval(async () => 
            {
                let connectionInfo = await roomClient.getConnectionInfo(appId, lobby.roomId);
                let status = connectionInfo.status;
                log(chalk.yellow(lobby.roomId), lobby.region, status);
                if (status == "active")
                {                     
                    clearInterval(interval);
                    log(connectionInfo);
                    let url = "https://" + connectionInfo.host + ":" + connectionInfo.port + "/";
                    log(chalk.yellow(lobby.roomId), chalk.green(url));
                    if (_data.inviteId)
                    {
                        log("Invited player:", _data.inviteId);
                        let invitedSocket = getSocketId(_data.inviteId, SOCKET_TYPE_GAME);
                        if (invitedSocket)
                        {
                            log("Send URL to", invitedSocket.id); 
                            invitedSocket.emit("onInvite", { 
                                hostId: _socket.id,
                                playerId: _socket.data.id,
                                username: _socket.data.username, 
                                name: _socket.data.name, 
                                gameModeId: _data.gameModeId,
                                url: url 
                            });
                        }
                    }
                    _callback({ url: url, inviteId: _data.inviteId });
                }
                else 
                {
                    _socket.emit("onCreateMultiplayerServer", { status: status });
                    if (num > 60)
                    {
                        clearInterval(interval);
                    }
                }
                num++;
            }, 1000);
        }
        else 
        {
            console.warn("Invalid lobby");
            _callback({ message: "Invalid lobby"});
        }
    }
    catch(e)
    {
        console.warn(e);
        _callback({ message: e.message });
    }
}

function handleChatMessage(_socket, _message)
{
    // Used to block certain words
    // var block = [];
    
    log(chalk.cyan(_socket.id), "CHAT", _message);
    // requires login for chat
    if (!_socket.data.username) 
    {
        sendChatMessageToSocket(_socket, {
            bServer: true,
            bDirect: true,
            messageText: "Create an Arsenal Online account to send chat messages."
        });
        return;
    }
    if (_socket.data.bMuted)
    {
        sendChatMessageToSocket(_socket, {
            bServer: true,
            bDirect: true,
            messageText: "You have been muted."
        });
        return;
    }
    /* Used to block certain words
    if (block.some(text => _message.toLowerCase().includes(text)) || block.some(text => _socket.data.name.toLowerCase().includes(text)))
    {
        _socket.data.bMuted = 1;
        return;
    }
    */
    if (!_message || !_message.length || !_message.trim().length || !_message.replace(/\s/g, '').length)
    {
        return;
    }
    var message = smile.checkText(_message);
    var msg = {
        playerText: _socket.data.name,
        level: _socket.data.level,
        prestige: _socket.data.prestige,
        playerId: _socket.data.id,
        username: _socket.data.username,
        messageText: message
    };
    var bAdmin = _socket.data.bAdmin;
    var bModerator = _socket.data.bModerator;
    var args = message.split(" ");
    if (args && args.length > 0)
    {
        var lobby = null; //getLobbyData(_socket.data.lobbyId);
        var bCommand = true;
        if (_socket.data.lobbyId)
        {
            sendChatMessageToLobby(_socket.data.lobbyId, msg);
        }
        else
        {
            sendChatMessageToAll(msg);
        }
        switch (args[0])
        {
            case "/mute":
                if (bAdmin || bModerator)
                {
                    mutePlayer(args[1]);
                }
                break;
            case "/ban":
                if (bAdmin || bModerator)
                {
                    banPlayer(args[1]);
                }
                break;  
        }
    }
}

function sendChatMessageToSocket(_socket, _data)
{
    if (_socket)
    {
        _data.date = Date.now();
        _socket.emit("chat", _data);
    }
}

function sendChatMessageToAll(_data, _bIncludePlayersInLobby = false)
{
    _data.date = Date.now();
    if (chatHistory.length >= 50)
    {
        chatHistory.splice(0, 1);
    }
    chatHistory.push(_data);
    for (const [_, socket] of io.of("/").sockets)
    {
        if (!socket.data.lobbyId || _bIncludePlayersInLobby)
        {
            socket.emit("chat", _data);
        }
    }    
}