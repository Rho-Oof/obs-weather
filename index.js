const fs = require('fs')
const OBSWebSocket = require('obs-websocket-js')
const Parser = require('rss-parser')
const obs = new OBSWebSocket()
let parser = new Parser()
let weatherItem = {}

const ago = (time) => {
	const delta = (Date.now() - time) / 1000
  let result
  if (delta < 60) result = 'less than a minute ago'
	else if ((delta / 60) < 2) result = `a minute ago`
	else if ((delta / 60) < 60) result = `${(delta / 60).toFixed(0)} minutes ago`
  else if ((delta / (60*60)) < 2) result = `an hour ago`
  else if ((delta / (60*60)) < 24) result = `${(delta / (60*60)).toFixed(0)} hours ago`
  else if ((delta / (60*60*24)) < 2) result = `a day ago`
  else if ((delta / (60*60*24)) > 1) result = `${(delta / (60*60*24)).toFixed(0)} days ago` 
	return result
}

const now = () => {
	const n = new Date()
	let r = `${n.getHours()}:`
  if ( n.getMinutes() < 10 ) r = r + '0'
  r = r + `${n.getMinutes()}`
  return r
}

const update = async () => {
  const feed = await parser.parseURL('https://w1.weather.gov/xml/current_obs/KDEN.rss')
  const item = feed.items[0]
  const {title, link, content, guid} = item
  const updated = new Date(guid)
  let icon = ''
	if (content.match(/<img src/))
		icon = content.replace(/^.*(src="[^"]*).*/smg, '<img $1">')
  const text = title.replace(/at Denver.*$/m,'');
	console.log(text, now(), 'updated', ago(updated), icon)
  let html = `<html><meta http-equiv="refresh" content="10"><body><h1>${icon}${text}</h1><h2>Local time: ${now()}</h2><h3>weather updated ${ago(updated)}</body></html>`
  fs.writeFileSync('weather.html', html)
}

const log = (src) => (data) => console.log('obs', src, data)

obs.on('VirtualcamStateChanged', log('VirtualcamStateChanged'))
obs.on('StreamStateChanged', log('StreamStateChanged'))

const connect = async () => obs.connect({ address: process.env.OBS_URL, password: process.env.OBS_PASSWORD })

const getSItems = async () => {
	let status
  try {
  status = await obs.send('GetVirtualCamStatus')
  const scene = await obs.send('GetCurrentScene')
  weatherItem = scene.sources.filter(s=>s.type=='browser_source').shift()
  const source = await obs.send('GetSourceSettings', {sourceName: weatherItem.name})
  console.log(source)
	} catch (e) { console.log('error', e) }
	return status
}

const run = async () => {
  console.log('booting...')
	update()
  let status
	let reconnectInterval
	let interval	
	obs.on('ConnectionOpened', async (data) => {
		if (reconnectInterval) {
			console.log('connected to obs')
			clearInterval(reconnectInterval)
			reconnectInterval = undefined
		}
		status = await getSItems()
		if (status?.isVirtualCam) {
			console.log('virtual cam already running, starting up')
			interval = setInterval(update, 30 * 1000)
		}
	})
	obs.on('ConnectionClosed', async (data) => {
		if (!reconnectInterval) {
			console.log('disconnected from obs, starting connection')
			reconnectInterval = setInterval(async() => {
			try {
				await connect(); 
		  } catch (e) {console.log(e)} }, 10 * 1000);
    }
	})
  try {
		await connect()
  } catch(e) { console.log('not connected') }
	obs.on('VirtualCamStarted', d => {
		log('VirtualcamStateChanged')(d)
		console.log('starting')
		interval = setInterval(update, 30 * 1000)
		})
	obs.on('VirtualCamStopped', d => {
		log('VirtualcamStateChanged')(d); 
		if (interval) {
			console.log('stopping')
			clearInterval(interval)
			interval = undefined
		}
	})
}

run()
