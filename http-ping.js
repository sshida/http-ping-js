#!/usr/bin/env node
// vi: sw=2 sts=2 et

// 一定の間隔でhttp HEADの応答statusを表示する

// undiciで、fetch()のagentをdetroyして、
// node 26.3でも、network shutdown後に回復するとHEAD応答も回復した

// node, undici 8.xを使っていそうなときは次のblockを挿入する
const isBuggyUndici8 = () => process?.versions?.undici?.startsWith('8.') // node, undici 8.xのとき
let globalFetchAgent, Agent, setGlobalDispatcher
if(isBuggyUndici8) ({Agent, setGlobalDispatcher} = await import('undici')) // npm install undici
const renewGlobalFetchAgent = async error => { // undiciのfetch()用agentを作り直す
  if(! isBuggyUndici8()) return // undici 8.xでなければ何もしない
  if(error.name !== "AbortError") return // abort()したのでなければ何もしない

  const [keepAliveTimeout, connections] = [5_000, 4]; // 最初のtimeoutはdefault=10秒。2回目以降でこの指定
  await globalFetchAgent?.destroy() // 既存のAgent, socketがあればをcloseする
  globalFetchAgent = new Agent({keepAliveTimeout, connections}) // undici fetch(): http agent
  setGlobalDispatcher(globalFetchAgent)
}

const localTimeText = () => Temporal.Now.plainDateTimeISO().toString().slice(0, 19)
const logInfo = (...args)  => console.info(localTimeText(), ...args)
const logErr = (...args)  => console.error(localTimeText(), ...args)

async function httpHeadRepeatedly({
  url,
  method = 'HEAD',
  timeoutMs = 5_000,
  repeatIntervalMs = 1_000,
}) {
  const controller = new AbortController()
  const {signal} = controller
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const start = Date.now()
    const response = await fetch(url, {method, signal})
    // read HEAD section only, do not read body section
    const elapsedMs = Date.now() - start
    logInfo(`${response.status} ${response.ok} - ${elapsedMs} ms`)
  } catch (err) {
    logErr(`ERROR — ${err.name}: ${err.message}`)
    if(err.name === 'TypeError') console.error(err.cause)
    // name='AbortError' message='This operation was aborte': SSID指定で止めたとき。err.causeなし
    // name='TypeError'  message='fetch failed': ubuntu 26.04でWi-Fi全体を止めたとき。err.causeあり

    renewGlobalFetchAgent(err) // abort()したときだけfetch agentを作り直す
  } finally {
    clearTimeout(timer)
    if(!(0 < repeatIntervalMs)) return
    setTimeout(() => httpHeadRepeatedly({url, method, timeoutMs, repeatIntervalMs}), repeatIntervalMs)
  }
}

const url = process?.argv[2] || "https://sshida.com"
console.log(`Monitoring: ${url} (Ctrl+C to stop)\n`)
httpHeadRepeatedly({url})
