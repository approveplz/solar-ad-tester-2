import { Request, Response } from 'express';
import dedent from 'dedent';
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    ConfigurationServiceClientCredentialFactory,
    TurnContext,
    ActivityTypes,
    ConversationReference,
} from 'botbuilder';
import { AdPerformance } from '../models/AdPerformance.js';

export class SkypeService {
    private adapter: CloudAdapter;
    private appId: string;
    private conversationMapping: {
        [key: string]: { conversationId: string; isGroup: boolean };
    } = {
        BRAYDEN_MARCUS_GROUP_CHAT: {
            conversationId: '19:53483778f0df422a8023b955ba2881b2@thread.skype',
            isGroup: true,
        },

        AMPLIFY_ADD_CREATION: {
            conversationId: '19:e0852f1802d84ea688b0f005459f901a@thread.skype',
            isGroup: true,
        },
        MA: {
            conversationId: '8:live:marcusawakuni',
            isGroup: false,
        },
        AZ: {
            conversationId: '29:1VfeA7iWoDuqsjKUNPSpumzuzAkBzEqORXCX78Kt3k3o',
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

    async sendMessage(
        conversationName: string,
        message: string
    ): Promise<void> {
        console.log(
            '[SkypeService] Sending message to conversation:',
            conversationName
        );
        const convDetails = this.getConversationDetails(conversationName);
        if (!convDetails) {
            console.error(
                `[SkypeService] Conversation "${conversationName}" not found.`
            );
            return;
        }

        await this.sendMessageByCid(
            convDetails.conversationId,
            dedent(message).trim(),
            convDetails.isGroup
        );
    }

    /**
     * IMPORTANT: For this bot to work properly, you must configure the messaging endpoint
     * in your Azure Bot Service configuration. The endpoint should point to where this
     * handleIncomingMessage function is exposed (e.g., https://us-central1-solar-ad-tester-2.cloudfunctions.net/handleIncomingSkypeMessageHttp).
     * This allows the bot to receive messages from Skype through Azure's Bot Framework.
     */

    async handleIncomingMessage(req: Request, res: Response): Promise<void> {
        console.log('[SkypeService] Handling incoming message:', req.body);
        await this.adapter.process(
            req,
            res,
            async (turnContext: TurnContext) => {
                if (turnContext.activity.type === ActivityTypes.Message) {
                    const incomingText = turnContext.activity.text;
                    console.log(
                        `[SkypeService] Incoming message: ${incomingText}`
                    );
                    console.log({ cid: turnContext.activity.conversation.id });
                    await turnContext.sendActivity('I received your message!');
                } else {
                    console.log(
                        `[SkypeService] Received non-message activity: ${turnContext.activity.type}`
                    );
                }
            }
        );
    }

    // Helpers
    private async sendMessageByCid(
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
                        textFormat: 'plain',
                    });
                }
            );
        } catch (error) {
            console.error('[SkypeService] Failed to send message:', error);
        }
    }

    createMessageWithAdPerformanceInfo(
        adPerformance: AdPerformance,
        includePerformanceMetrics = true
    ) {
        return `Facebook Ad ID: ${adPerformance.fbAdId}
        Facebook Ad Set ID: ${adPerformance.fbAdSetId}
        Facebook Ad Set Name: ${adPerformance.adName}
        ${
            includePerformanceMetrics
                ? `Last 3 Days FB ROI: ${
                      adPerformance.performanceMetrics.fb?.last3Days?.roi || 0
                  }
        Lifetime FB ROI: ${
            adPerformance.performanceMetrics.fb?.lifetime?.roi || 0
        }
        Last 3 Days FB Spend: ${
            adPerformance.performanceMetrics.fb?.last3Days?.spend || 0
        }
        Lifetime FB Spend: ${
            adPerformance.performanceMetrics.fb?.lifetime?.spend || 0
        }`
                : ''
        }
        `;
    }
}
