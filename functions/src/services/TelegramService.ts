import {
    deleteTelegramScriptDataById,
    getTelegramScriptDataById,
} from '../firestoreCloud.js';
import {
    getFullVerticalName,
    VerticalCodes,
    gDriveIngestrionFolderUrl,
    MediaBuyerCodes,
} from '../helpers.js';

export class TelegramService {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    public readonly adCreationChatId: string;
    public readonly webhookUrl: string;
    public readonly mediaBuyerChatIds: Record<string, string>;
    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.baseUrl = `https://api.telegram.org/bot${this.apiKey}`;
        // this.adCreationChatId = '-1002677775905';
        this.adCreationChatId = '-4625142036';
        this.webhookUrl = `https://us-central1-solar-ad-tester-2.cloudfunctions.net/handleTelegramWebhookHttp`;
        this.mediaBuyerChatIds = {
            [MediaBuyerCodes.MA]: '1684198383',
            [MediaBuyerCodes.AZ]: '6774897863',
            [MediaBuyerCodes.FR]: '6820566331',
        };
    }

    /**
     * Sends a message to a specific Telegram chat
     * @param chatId The ID of the chat to send the message to
     * @param text The message markdown text to send
     * @returns Promise containing the response from Telegram API
     */
    public async sendMessage(chatId: string, text: string): Promise<any> {
        try {
            const payload: Record<string, any> = {
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
            };

            const response = await fetch(`${this.baseUrl}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    `Telegram API error: ${response.status} ${
                        response.statusText
                    } - ${JSON.stringify(errorData)}`
                );
            }

            const result = await response.json();

            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Sends a message with inline keyboard buttons for approval/rejection
     * @param chatId The ID of the chat to send the message to
     * @param text The message markdown text to send
     * @param scriptId The ID of the script for reference
     * @returns Promise containing the response from Telegram API
     */
    public async sendMessageWithApprovalButtons(
        chatId: string,
        text: string,
        scriptId: string
    ): Promise<any> {
        try {
            // Create structured callback data with just action and scriptId
            const approveCallback = JSON.stringify({
                action: TelegramCallbackAction.APPROVE,
                scriptId,
            });

            const rejectCallback = JSON.stringify({
                action: TelegramCallbackAction.REJECT,
                scriptId,
            });

            // Double-check we're within Telegram's 64-byte limit
            if (approveCallback.length > 64) {
                console.warn(
                    `Warning: Callback data exceeds 64 bytes: ${approveCallback.length} bytes`
                );
            }

            const payload: Record<string, any> = {
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '✅ Approve',
                                callback_data: approveCallback,
                            },
                            {
                                text: '❌ Reject',
                                callback_data: rejectCallback,
                            },
                        ],
                    ],
                },
            };

            const response = await fetch(`${this.baseUrl}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    `Telegram API error: ${response.status} ${
                        response.statusText
                    } - ${JSON.stringify(errorData)}`
                );
            }

            const result = await response.json();

            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Process callback query from button clicks
     * @param callbackQueryId The ID of the callback query to answer
     * @param text Optional text to show to the user
     * @returns Promise containing the response from Telegram API
     */
    public async answerCallbackQuery(
        callbackQueryId: string,
        text?: string
    ): Promise<any> {
        try {
            const payload: Record<string, any> = {
                callback_query_id: callbackQueryId,
            };

            if (text) {
                payload.text = text;
            }

            const response = await fetch(
                `${this.baseUrl}/answerCallbackQuery`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    `Telegram API error: ${response.status} ${
                        response.statusText
                    } - ${JSON.stringify(errorData)}`
                );
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Set up webhook for Telegram bot to receive updates
     * @param webhookUrl The URL where Telegram will send updates
     * @returns Promise containing the response from Telegram API
     */
    public async setWebhook(webhookUrl: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/setWebhook`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: webhookUrl }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    `Telegram API error: ${response.status} ${
                        response.statusText
                    } - ${JSON.stringify(errorData)}`
                );
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Process webhook updates from Telegram
     * @param update The update received from Telegram
     * @returns Result of processing the update
     */
    public async handleWebhook(
        update: TelegramUpdate
    ): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(
                'Telegram update object',
                JSON.stringify(update, null, 2)
            );

            // Handle callback queries (button clicks)
            if (update.callback_query) {
                const { id, data, message } = update.callback_query;

                try {
                    const callbackData: TelegramCallbackData = JSON.parse(data);

                    const { scriptId } = callbackData;

                    if (!scriptId) {
                        console.error('No scriptId in callback data');
                        await this.sendMessage(
                            message.chat.id.toString(),
                            `Error: No script ID provided.`
                        );
                        return {
                            success: false,
                            error: 'No scriptId in callback data',
                        };
                    }

                    // Retrieve the script data from Firestore
                    const scriptData = await getTelegramScriptDataById(
                        scriptId
                    );

                    if (!scriptData) {
                        console.error(
                            `Script with ID ${scriptId} not found in Firestore`
                        );
                        await this.sendMessage(
                            message.chat.id.toString(),
                            `Error: Could not find script data.`
                        );
                        return {
                            success: false,
                            error: `Script with ID ${scriptId} not found`,
                        };
                    }

                    // Extract all data from Firebase
                    const {
                        idea,
                        creator,
                        vertical,
                        notes,
                        script,
                        scriptIndex,
                    } = scriptData;
                    if (
                        callbackData.action === TelegramCallbackAction.APPROVE
                    ) {
                        // Answer the callback query to acknowledge the button press
                        await this.answerCallbackQuery(
                            id,
                            `Script ${scriptIndex} has been approved!`
                        );

                        this.sendMessageToVideoEditor(
                            creator,
                            vertical as VerticalCodes,
                            notes,
                            script
                        );

                        await this.sendMessage(
                            message.chat.id.toString(),
                            `✅ Script ${scriptIndex} has been approved`
                        );

                        return { success: true };
                    } else if (
                        callbackData.action === TelegramCallbackAction.REJECT
                    ) {
                        await this.answerCallbackQuery(
                            id,
                            `Script ${scriptIndex} has been rejected.`
                        );

                        await this.sendMessage(
                            message.chat.id.toString(),
                            `❌ Script ${scriptIndex} has been rejected`
                        );

                        await deleteTelegramScriptDataById(scriptId);

                        return { success: true };
                    }
                } catch (error) {
                    console.error('Error processing callback data:', error);
                    await this.answerCallbackQuery(
                        id,
                        'Error processing request'
                    );
                    return {
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    };
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Error in webhook handler:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public sendMessageToVideoEditor(
        creator: string,
        vertical: VerticalCodes,
        notes: string,
        script: string
    ): Promise<any> {
        const verticalFullName = getFullVerticalName(vertical);

        const message = `[Francisco](tg://user?id=${
            this.mediaBuyerChatIds[MediaBuyerCodes.FR]
        }) Can you create some ${verticalFullName} ads from this scripts modeling this style of video with b-roll, subtitles, and voiceover?

        Script:
        ${script}

        Notes:
        ${notes}

        Video example:
        https://drive.google.com/file/d/1PL-4gQfLf9bdIRAdd7a3kdbjuUArNrbd/view?usp=sharing

        When the video is ready, please send to AMPLIFY AD CREATION channel for approval.

        Once approved, please put the mp4 file in this folder:
        ${gDriveIngestrionFolderUrl}

        Can you please name the file:
        ${vertical}-${creator}-${creator}-${creator}-{put anything you want here, its just because we need unique file names}

        Thanks!
        `;
        return this.sendMessage(this.adCreationChatId, message);
    }
}

// Telegram API type definitions
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
    message_id: number;
    from: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
}

export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

export interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
}
export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message: TelegramMessage;
    chat_instance: string;
    data: string;
    inline_message_id?: string;
}

export enum TelegramCallbackAction {
    APPROVE = 'approve',
    REJECT = 'reject',
}

export interface TelegramCallbackData {
    action: TelegramCallbackAction;
    scriptId: string;
}
