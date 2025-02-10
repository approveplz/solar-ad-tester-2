import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    ConfigurationServiceClientCredentialFactory,
    TurnContext,
    ActivityTypes,
    ConversationReference,
} from 'botbuilder';

export class SkypeService {
    private adapter: CloudAdapter;
    private appId: string;
    private conversationMapping: {
        [key: string]: { conversationId: string; isGroup: boolean };
    } = {
        TEST_GROUP_CHAT: {
            conversationId: '19:53483778f0df422a8023b955ba2881b2@thread.skype',
            isGroup: true,
        },

        AMPLIFY_ADD_CREATION: {
            conversationId: '19:e0852f1802d84ea688b0f005459f901a@thread.skype',
            isGroup: true,
        },
        MARCUS: {
            conversationId: '8:live:marcusawakuni',
            isGroup: false,
        },
    };

    constructor(appId: string, appPassword: string) {
        this.appId = appId;
        const credentialsFactory =
            new ConfigurationServiceClientCredentialFactory({
                MicrosoftAppId: appId,
                MicrosoftAppPassword: appPassword,
            });

        const botFrameworkAuth = new ConfigurationBotFrameworkAuthentication(
            {},
            credentialsFactory
        );

        this.adapter = new CloudAdapter(botFrameworkAuth);
    }

    private getConversationDetails(
        name: string
    ): { conversationId: string; isGroup: boolean } | null {
        return this.conversationMapping[name] || null;
    }

    private async sendMessage(
        conversationId: string,
        message: string,
        isGroup: boolean
    ): Promise<void> {
        try {
            const conversationRef: Partial<ConversationReference> = {
                serviceUrl: 'https://smba.trafficmanager.net/apis/',
                conversation: {
                    id: conversationId,
                    isGroup: isGroup,
                    conversationType: 'group',
                    name: 'Skype Group Chat',
                },
                channelId: 'skype',
                bot: {
                    id: this.appId,
                    name: 'Skype Bot',
                },
            };

            await this.adapter.continueConversationAsync(
                this.appId,
                conversationRef,
                async (turnContext: TurnContext) => {
                    await turnContext.sendActivity({
                        type: ActivityTypes.Message,
                        text: message,
                    });
                }
            );
        } catch (error) {
            console.error('[SkypeService] Failed to send message:', error);
        }
    }

    async sendMessageByConversationName(
        conversationName: string,
        message: string
    ): Promise<void> {
        const convDetails = this.getConversationDetails(conversationName);
        if (!convDetails) {
            console.error(
                `[SkypeService] Conversation "${conversationName}" not found.`
            );
            return;
        }

        await this.sendMessage(
            convDetails.conversationId,
            message,
            convDetails.isGroup
        );
    }
}
