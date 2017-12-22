
const Assistant = require("google-assistant/components/assistant")
const OAuth2 = new (require('google-auth-library'))().OAuth2;
const embeddedAssistant = require("google-assistant/lib/google/assistant/embedded/v1alpha2/embedded_assistant_pb")
const path = require("path")
const fs = require("fs")

function auth(config) {
  const key = require(config.keyFilePath).installed
  const oauthClient = new OAuth2(key.client_id, key.client_secret, key.redirect_uris[0])
  const tokensFile = fs.readFileSync(config.savedTokensPath)
  const tokens = JSON.parse(tokensFile)
  oauthClient.setCredentials(tokens)
  return oauthClient
}

function createRequestConfig(textQuery, deviceConfig) {
  const c = new embeddedAssistant.AssistConfig()
  c.setTextQuery(textQuery)

  const audioOut = new embeddedAssistant.AudioOutConfig()
  audioOut.setEncoding(embeddedAssistant.AudioOutConfig.Encoding.MP3)
  audioOut.setSampleRateHertz(16000),
  audioOut.setVolumePercentage(0)
  c.setAudioOutConfig(audioOut)

  // TODO: add deviceLocation here
  const dialogStateIn = new embeddedAssistant.DialogStateIn()
  dialogStateIn.setLanguageCode("en-US")
  //dialogStateIn.setConversationState("")
  c.setDialogStateIn(dialogStateIn)

  const deviceConfigx = new embeddedAssistant.DeviceConfig()
  deviceConfigx.setDeviceId(deviceConfig.deviceId)
  deviceConfigx.setDeviceModelId(deviceConfig.deviceModelId)
  c.setDeviceConfig(deviceConfigx)

  return c
}

function createRequest(textQuery, deviceConfig) {
  const config = createRequestConfig(textQuery, deviceConfig)

  const req = new embeddedAssistant.AssistRequest()
  req.setConfig(config)
  return req
}

function doAssist(queryText, assistant, config) {
  return new Promise((resolve, reject) => {
    const channel = assistant.assist()
    const recv = []
  
    channel.on('data', (data) => {
      try {
        const x = data.toObject()
        const t = x.dialogStateOut.supplementalDisplayText
        if (t != null && t.trim() !== "") {
          recv.push(t.trim())
        }
      } catch (err) {}
    })
  
    channel.on('end', () => {
      resolve(recv.join(" "))
    })
  
    channel.on("error", err => {
      reject(err)
    })
  
    channel.write(createRequest(queryText, config))
  })
}

module.exports = function (RED) {
  function AssistNode(config) {
    RED.nodes.createNode(this, config)

    const creds = {
      keyFilePath: path.resolve(this.credentials.keyFilePath),
      savedTokensPath: path.resolve(this.credentials.savedTokensPath)
    }
    
    const assistant = new Assistant(auth(creds))

    this.on("input", msg => {
      const ctx = msg.googleAssistant

      if (ctx && ctx.action === "SET_GEOLOCATION") {
        // TODO
      }

      // Assume text query otherwise
      const queryText = msg.payload
      
      doAssist(queryText, assistant, {
          deviceId: config.deviceId,
          deviceModelId: config.deviceModelId
        })
        .then(answer => {
          if (answer == null || answer.trim() === "") {
            console.log("NO SEND")
            this.send([null, msg])
          } else {
            console.log("SEND")
            msg.payload = answer
            this.send([msg, null])
          }
        })
        .catch(err => this.error(err))
    })
  }

  RED.nodes.registerType("google-assistant", AssistNode, {
    credentials: {
      keyFilePath: { type: "text", value: "google-assistant-key.json" },
      savedTokensPath: { type: "text", value: "google-assistant-tokens.json" }
    }
  })
}