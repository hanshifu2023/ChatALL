import axios from "axios";
import Bot from "./Bot";
import AsyncLock from "async-lock";

function extractFromHTML(variableName, html) {
  const regex = new RegExp(`"${variableName}":"([^"]+)"`);
  const match = regex.exec(html);
  return match?.[1];
}

async function fetchRequestParams() {
  const { data: html } = await axios.get("https://bard.google.com/faq");
  const atValue = extractFromHTML("SNlM0e", html);
  const blValue = extractFromHTML("cfb2h", html);
  return { atValue, blValue };
}

function parseBartResponse(resp) {
  const data = JSON.parse(resp.split("\n")[3]);
  const payload = JSON.parse(data[0][2]);
  if (!payload) {
    throw new Error("Failed to access Bard");
  }
  const text = payload[0][0];
  return {
    text,
    ids: [...payload[1], payload[4][0][0]],
  };
}

export default class BardBot extends Bot {
  static _brandId = "bard";
  static _className = "BardBot"; // Class name of the bot
  static _logoFilename = "bard-logo.svg"; // Place it in assets/bots/
  static _loginUrl = "https://bard.google.com/";
  // Remove Electron from the user agent to avoid blank login screen
  static _userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ChatALL/1.18.13 Chrome/112.0.5615.165 Safari/537.36";
  static _lock = new AsyncLock();

  constructor() {
    super();
  }

  async checkAvailability() {
    const context = await this.getChatContext();
    context.requestParams = await fetchRequestParams();
    if (context.requestParams.atValue) {
      this.constructor._isAvailable = true;
    } else {
      this.constructor._isAvailable = false;
    }
    return this.isAvailable();
  }

  async _sendPrompt(prompt, onUpdateResponse, callbackParam) {
    const context = await this.getChatContext();
    return new Promise((resolve, reject) => {
      const { requestParams, contextIds } = context;

      axios
        .post(
          "https://bard.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
          new URLSearchParams({
            at: requestParams.atValue,
            "f.req": JSON.stringify([
              null,
              `[[${JSON.stringify(prompt)}],null,${JSON.stringify(
                contextIds,
              )}]`,
            ]),
          }),
          {
            params: {
              bl: requestParams.blValue,
              _reqid: Math.floor(Math.random() * 900000) + 100000,
              rt: "c",
            },
          },
        )
        .then(({ data: resp }) => {
          const { text, ids } = parseBartResponse(resp);
          context.contextIds = ids;
          onUpdateResponse(callbackParam, { content: text, done: true });
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  async createChatContext() {
    return {
      requestParams: null,
      contextIds: ["", "", ""],
    };
  }
}
