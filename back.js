const axios = require('axios'), {MongoClient} = require('mongodb'),
    client = new MongoClient(process.env.MONGO_URI_GUNSM), db = client.db('e-logbook'),
    gunRecsFin = db.collection('hist'), gunRecsMut = db.collection('poli'),
    gunSts = db.collection('snap'), roles = db.collection('role'),
    fauth = (x, y) => {if(x!=y)throw{m:'fail'};return;}, fcd = (x, y) => Promise.resolve(y),
    // formsg = {webhooks: {authenticate: fauth}, crypto: {decryptWithAttachments: fcd, decrypt: fcd}},
    formsg = require('@opengovsg/formsg-sdk')(), key = process.env.FORM_SECRET_GUNSM,
    POST_URI = 'https://untitled-y5lu9ps9bu17.runkit.sh/submissions', HAS_ATTACHMENTS = !0,
    express = require('express'), tonicExpress = require('@runkit/runkit/express-endpoint/1.0.0'),
    token = process.env.BOT_TOKEN_GUNSM, b = `/bot${token}`, chatID = -1001868636368,
    app = tonicExpress(module.exports), bodyParser = require('body-parser@1.20.1'),
    rvRgxOf = inp => ({$expr: {$regexMatch: {input: inp, regex: '$of'}}}),
    ms = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'.split`|`, CryptoJS = require('crypto-js');

axios.defaults.baseURL = 'https://api.telegram.org';
app.use(bodyParser.urlencoded({extended: !1}));

function shortStr(s, sep) {
    s = s.toLowerCase().replace(/[^a-z\d ]/gi, '').split` `;
    let cutWords = 'an,and,any,are,during,for,is,of,the,this,to,what,which,you'.split`,`;
    return s.filter(e => e && !~cutWords.indexOf(e)).join(sep);
}

function processFormData(data) { // What colour is air? - Blue, What are the first 4 primes? - [2, 3, 5, 7]
    let cleanOut = {};
    for (let k in data) {
        let i = data[k], iq = shortStr(i.question, '_'), iqa = {};
        // populate output cleanOut only if answer(s) present, ie exclude unanswered optional
        if ('answer' in i && i.answer != '') cleanOut[iq] = i.answer;
        if ('answerArray' in i && i.answerArray != null && i.answerArray.length) cleanOut[iq] = i.answerArray;
    }
    return cleanOut; // {colour_air: 'Blue', first_4_primes: [2, 3, 5, 7]}
}

function processHandlerStatus(clean) { // behave differently for FPT, HOTO...
    const typ = clean.action_performed, stdiseOrg = o => ~(o = o.toUpperCase()).indexOf(')') ? o : `21SA(${o})`;
    let res = {n: +clean.gun_number};
    if ('final_engine_hour' in clean) res.hf = +clean.final_engine_hour;
    switch (typ) {
        case 'HOTO GUN':
            res.from = stdiseOrg(clean.handing_over_unitbattery);
            res.to = stdiseOrg(clean.taking_over_unitbattery);
            break;
        case 'FPT':
            res.FPT = !0;
            break;
        case 'Monthly':
        case 'Yearly':
            const a2 = [
                ['arm', 'recoil_mechanism'], ['ac', 'chassis'], ['afp', 'firing_platform'], ['afr', 'flick_rammer']
            ];
            for (let e of a2) if (clean[`abnormalfault_${e[1]}`] == 'Yes') res[e[0]] = !0;
        case 'Weekly':
            const a1 = [
                ['abbm', 'barrel_breech_mechanism'], ['atl', 'trail_leg'],
                ['aapu', 'apu'], ['apts', 'pts'], ['adas', 'das'], ['accm', 'ccm'], ['alad', 'lad']
            ];
            for (let e of a1) if (clean[`abnormalfault_${e[1]}`] == 'Yes') res[e[0]] = !0;
            res.pn = clean.pts_number;
            res.sa = clean.standard_angle;
            res.PMCS = !0;
            res.FPT = !0;
            break;
    }
    return res;
}
function showStatus(msgID) { // update pinned msg w/ minimalist summary of gun snapshots
    let staStrs = {};
    return gunSts.find({_id: {$gte: 0}}).forEach(doc => {
        let staDetl = [], dOf = doc.of;
        for (let k in doc) {
            if (!~['_id', 'timestamp', 'of'].indexOf(k)) {
                if (k == 'FPT' || k == 'PMCS') doc[k] = doc[k] ? '✅' : '❌';
                if (k == 'hours') doc[k] = doc[k].toFixed(1);
                staDetl.push(`${k} ${doc[k]}`);
            }
        }
        let ln = `${doc._id}: ${staDetl.join`, `}`;
        if (dOf in staStrs) staStrs[dOf].push(ln);
        else staStrs[dOf] = [ln];
    }).then(r => {
        let res = [];
        for (let num in staStrs) res.push(`*${num}*\n${staStrs[num].join`\n`}`);
        return axios.post(`${b}/editMessageText`, {chat_id: chatID, message_id: msgID,
            text: mdEsc(res.sort((a, b) => {
                let c = x => x.match(/^\*([^*]+)\*/)[1];
                return c(a).localeCompare(c(b), undefined, {numeric: !1, sensitivity: 'base'});
            }).join`\n`), parse_mode: 'MarkdownV2'});
    });
}
function setStatus(clean, d, msgID) { // update snap col then show on tg. if org unknown, still put n/a
    let updata = processHandlerStatus(clean), n = updata.n, $set = {timestamp: d}, tdy;
    if ('hf' in updata) $set.hours = updata.hf;
    if ('to' in updata) $set = {...$set, from: updata.from, of: updata.to};
    if ('FPT' in updata || 'PMCS' in updata) {
        tdy = d.toLocaleDateString('en-GB', {timeZone: 'Asia/Singapore'}).replace(/\/(\d\d)\//, (a, b) => ` ${ms[b-1]} `);
        if (tdy == clean.entry_date) {
            $set.FPT = !0;
            if ('PMCS' in updata) $set.PMCS = !0;
        }
    }
    return gunSts.findOne({_id: n}).then(r => {
        if (!r) throw {rcpt: 'grp', m: `Error: Please \`/setgunorg\` to add gun ${n} to database before making a form submission.`};
        let errArr = [];
        if (r) {
            if ('FPT' in $set && r.FPT) errArr.push('Double FPT');
            if ('PMCS' in $set && r.PMCS) errArr.push('Double PMCS');
            if ('hours' in $set) {
                let incH = ($set.hours-r.hours).toFixed(1);
                if ('FPT' in $set && incH < ('PMCS' in $set ? .5 : .3) || incH >= 4)
                    errArr.push('Invalid change to engine hour');
            }
            if ('from' in $set) {
                if (r.of != 'n/a' && r.of != $set.from)
                    errArr.push(`Current owner is ${r.of}, cannot HOTO from ${$set.from}`);
                if ('from' in r && r.from == $set.from) {
                    errArr.push(`Already performed HOTO from ${r.from}, owner is now ${r.of}`);
                    if (r.of == $set.of) errArr.push(`Double HOTO to ${r.of}`);
                }
            }
        }
        if (errArr.length) throw {rcpt: r.of, m: `A form has been submitted for gun ${n} that may bear the following mistakes:\n${errArr.join`\n`}\nPlease ignore this message if it is in error.`};
        for (let k in $set)
            if ($set.hasOwnProperty(k) && k != 'timestamp') return gunSts.updateOne({_id: n}, {$set}, {upsert: !0});
        throw {t: 'no snap update'};
    }).then(r => showStatus(msgID));
}

function encr(str) { return CryptoJS.AES.encrypt(str, key).toString(); }
function setRecord(fSG) { // q&a obj, Date
    fSG.nric = encr(fSG.nric);
    fSG.id = new Date(fSG.entry_date);
    fSG.metadata = {gun_number: +fSG.gun_number};
    if ('final_engine_hour' in fSG) fSG.final_engine_hour = +fSG.final_engine_hour;
    delete fSG.gun_number;
    if ('amendment_id' in fSG) { // tbc, must be numeric
        let target = +fSG.amendment_id;
        return gunRecsMut.findOne({resNum: target}).then(r => {
            if (!r) return;
            let $unset = {};
            for (let k in r) {
                if (~['_id', 'resNum'].indexOf(k) || k in fSG) continue;
                $unset[k] = 1;
            }
            delete fSG.amendment_id;
            return gunRecsMut.updateOne({resNum: target}, {$unset, $set: fSG});
        });
    }
    return gunSts.findOne({_id: -1}).then(r => {
        let rand = ~~(Math.random() * 901) + 100;
        fSG.resNum = r.resNum + rand;
        return Promise.all([gunRecsFin.insertOne(fSG), gunRecsMut.insertOne(fSG),
            gunSts.updateOne({_id: -1}, {$inc: {resNum: rand}})]);
    });
}

// escape md special characters except * for bold, ~ strikethrough, ` monospace
function mdEsc(x) { return x ? x.replace(/([\\_{}\[\]<>()#+-.!|])/g, '\\$1') : 'n/a'; }
function botSend(msg, s) { // if arg s (tg user id) present, will pm that 1 user instead of sending to chat
    return axios.post(`${b}/sendMessage`, {chat_id: s ? s : chatID, text: mdEsc(msg), parse_mode: 'MarkdownV2'});
}

app.post('/',
    express.json(),
    (req, res) => {
        const b = req.body, resOK = () => res.sendStatus(200);
        if (!('cat' in b)) return resOK();
        const cat = b.cat;
        let catRem, catRst;
        if (catRem = cat.match(/^rem_(.+)/)) {
            let boSe = (t, org, appt) => { // botSend msg t to indiv if org, appt present else to grp
                if (appt) return roles.findOne({appt: appt, ...rvRgxOf(org)}).then(r => r ? botSend(t, r._id) : 0);
                else return botSend(t);
            }, remind = (t, p) => { // do reminding xcpt in skip season in which case add explanatory doc to hist
                let x = [], isFPT = t == 'FPT', skOp, today = new Date(); sk = [],
                    fmtDmy = d => d.toLocaleDateString('en-GB', {timeZone: 'Asia/Singapore'}), getMyMon = d => {
                        let d2 = new Date(d);
                        d2.setDate(d2.getDate() - d2.getDay() + 1);
                        return d2;
                    };
                return gunSts.findOne({_id: -1}).then(r => {
                    r = r.skips;
                    skOp = isFPT ? r.fpt : r.pmcs;
                    if (skOp.length) {
                        for (let e of skOp) {
                            if (isFPT) {
                                let tdyCopy = new Date(today);
                                if (!p) tdyCopy.setDate(tdyCopy.getDate() - 1);
                                if (tdyCopy - new Date(e) < 8.64e7) {
                                    sk.push(t);
                                    break;
                                }
                            } else {
                                e = new Date(e);
                                if (fmtDmy(getMyMon(e)) == fmtDmy(getMyMon(today))) {
                                    sk.push(t);
                                    break;
                                }
                            }
                        }
                    }
                    if (sk.length) throw {sk};
                    return;
                }).then(r => gunSts.find({_id: {$gte: 0}}).forEach(e => x.push(e)).then(r => {
                        x = x.filter(e => t in e && !e[t]).map(e => `${t} late/incomplete for gun ${e._id}.`)
                            .join`\n`;
                        return p ? p.map(f => boSe(x, e.of, f)) : boSe(x);
                })).catch(e => {
                    let rF = r.fpt, rP = r.pmcs, isFut = d => new Date(d) > today,
                        skipsVal = {fpt: rF.filter(isFut), pmcs: rP.filter(isFut)};
                    return e.sk.map(f =>
                        gunRecsFin.insertOne({id: today, skip_info: [f, isFPT? 'today' : 'this week']})
                            .concat([p ? 1 : gunSts.updateOne({_id: -1}, {$set: {skips: skipsVal}})])
                    );
                }).finally(resOK);
            };
            switch (catRem[1]) {
                // notify ppl if info from snap col shows late/inc
                case 'fpt1': remind('FPT', ['GUN IC']);
                case 'fpt2': remind('FPT', ['SM']);
                case 'fpt3': remind('FPT'); // grp
                case 'pmcs1': remind('PMCS', ['GUN IC', 'SM']);
                case 'pmcs2': remind('PMCS');
                default: return resOK();
            }
        } else if (catRst = cat.match(/^rst_(.+)/)) { // rst = reset
            let rstWhich = catRst[1];
            switch (rstWhich) {
                case 'fpt':
                case 'pmcs':
                    let $set = {};
                    $set[rstWhich.toUpperCase()] = !1;
                    return gunSts.updateMany({}, {$set}).then(v => showStatus(388)).finally(resOK);
                default: return resOK();
            }
        } else return resOK();
    });

app.post('/submissions',
    (req, res, next) => {
        try {
            formsg.webhooks.authenticate(req.get('X-FormSG-Signature'), POST_URI);
            return next(); // continue processing POST body
        } catch (e) { res.sendStatus(401); }
    },
    express.json(),
    (req, res) => { // decrypt submission. if decryption fails, submission is null
        let pfdc, resOK = () => res.sendStatus(200), r1;
        // get submission content itself, setStatus & -Record in parallel
        return formsg.crypto[`decrypt${HAS_ATTACHMENTS ? 'WithAttachments' : ''}`](key, req.body.data).then(r => {
            if (!r) return console.error('Failed to decrypt');
            let ts = new Date(), content = r.content.responses;
            pfdc = processFormData(content);
            return Promise.all([setStatus(pfdc, ts, 388), setRecord(pfdc)]);
        }).then(r => { // from this line down notify w/ approval btn when last gun of any bty done pmcs
            let isLy = ~['Monthly', 'Weekly', 'Yearly'].indexOf(pfdc.action_performed);
            if (!isLy) throw {t: 'not pmcs'};
            return gunSts.findOne({_id: +pfdc.metadata.gun_number});
        }).then(r => Promise.all([gunSts.findOne({of: r.of, PMCS: !1}), r.of]))
        .then(r => {
            if (r[0]) throw {t: 'not all guns pmcs'};
            r1 = r[1];
            return Promise.all([roles.findOne({appt: 'SM', ...rvRgxOf(r1)}), r1]);
        }).then(r => {
            let r0 = r[0], r0i;
            r1 = r[1];
            if (!r0) throw {t: 'role not in db'};
            return botSend(`All guns belonging to ${r1} are finished with PMCS. Weekly approval may be indicated \
via the \`/weekly\` command. Please ignore this message if it is in error.`, r0i = r0._id);
        }).catch(e => {
            if (!('m' in e)) return console.error(e);
            return roles.findOne({appt: 'GUN IC', ...rvRgxOf(e.rcpt)})
                .then(r => botSend(e.m, r ? r._id : chatID /* temp */)).catch(console.error);
        }).finally(resOK);
    });
