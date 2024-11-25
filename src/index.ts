import { PluginDefinition, setupPluginServer } from 'connery';
import chatWithYourMysqlDb from "./actions/chatWithYourMysqlDb.js";

const pluginDefinition: PluginDefinition = {
  name: 'mySQL',
  description: 'Connery plugin to chat with a mySQL database',
  actions: [chatWithYourMysqlDb],
};

const handler = await setupPluginServer(pluginDefinition);
export default handler;
