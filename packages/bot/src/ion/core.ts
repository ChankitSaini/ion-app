import env from "../env";
import winston from "winston";
import { Api, TelegramClient } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";

import { StringSession } from "telegram/sessions";
import * as appConfig from "./providers/app-config";
import * as moduleConfig from "./providers/module-config";
import * as sessionProvider from "./providers/session";
import io from "./socket";
import VERSION from "../version";
import { allModules } from "./modules";

import { Logger } from "telegram/extensions";
Logger.setLevel("errors");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [], //todo: add file logging
});

if (env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

export default new (class Ion {
  private client: TelegramClient | undefined;
  private session: StringSession | undefined;
  private prefixes: string | string[] = appConfig.load("prefix"); // get from config

  public errorCount: number = 0;
  public config: object = {};
  public loadedModules: any[] = [];
  private apiId: number;
  private apiHash: string;
  public user: Api.User | undefined;
  public botStatus: number;
  public startTime: Date = new Date();

  constructor() {
    logger.info(`Initializing Ion v${VERSION}`);

    this.apiId = 0;
    this.apiHash = "";
    this.botStatus = 0;

    io.on("connection", (socket) => {
      /**
       * This will hanlde all the socket events
       */

      socket.on("update-config", (data) => {
        this.configUpdater(data);
      });
      socket.on("stop-bot", () => {
        this.stopBot();
      });
    });

    this.start();
  }

  log() {}

  async start() {
    /**
     * Starts the bot, and updates the start time.
     * If started, load all modules
     */

    this.startTime = new Date();
    const session = sessionProvider.load();
    this.apiId = Number(session.apiId);
    this.apiHash = session.apiHash;
    this.session = new StringSession(session.session);

    if (this.session && this.apiHash && this.apiId) {
      this.client = new TelegramClient(this.session, this.apiId, this.apiHash, {
        connectionRetries: 15,
      });

      await this.client.start({ botAuthToken: "" });

      this.user = (await this.client.getMe()) as Api.User;
      this.botStatus = 1;

      logger.info(`logged in as ${this.user.firstName}`);
      this.loadModules();
    }
  }

  createPattern(text: string | RegExp) {
    if (typeof text == "string") {
      const prefixes = (
        Array.isArray(this.prefixes) ? this.prefixes : [this.prefixes]
      ).join("|");

      return new RegExp(`^${prefixes}${text}`);
    }
    return text;
  }

  loadModules() {
    /**
     * Loads Each Module by mapping.
     * Also get module configuration from database
     */

    allModules.map(async (mod) => {
      const { meta } = mod;
      const config: any = await moduleConfig.get(meta.slug);
      let mode = {
        outgoing: meta.mode === "outgoing",
        icoming: meta.mode === "incoming",
      };

      try {
        this.client?.addEventHandler((event: NewMessageEvent) => {
          mod.handler(event, config.values);
        }, new NewMessage({ ...mode, pattern: this.createPattern(meta.match) }));

        this.loadedModules.push({
          ...meta,
          configValues: config ? config.values : {},
        });
      } catch (e) {
        this.errorCount++;
      }
    });
  }

  configUpdater(data: any) {
    const { module, values } = data;
    moduleConfig.set(module, values);
  }

  stopBot() {
    this.botStatus = 0;
    this.client?.destroy();
    /** stop user bot */
  }
})();
