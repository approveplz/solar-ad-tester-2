/**
 * TrelloService wraps commonly used Trello API endpoints using the built-in fetch API.
 * Reference: https://developer.atlassian.com/cloud/trello/rest/
 */
export class TrelloService {
    private apiKey: string;
    private apiToken: string;
    private baseUrl: string;
    private creativeRequestsListId: string = '6713cedfa8701c3040f4db2b';
    private roofingTemplateId: string = '678e693927ac1f163fd0067c';

    constructor(apiKey: string, apiToken: string) {
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('Trello API key is required and must be a string');
        }
        if (!apiToken || typeof apiToken !== 'string') {
            throw new Error(
                'Trello API token is required and must be a string'
            );
        }
        this.apiKey = apiKey;
        this.apiToken = apiToken;
        this.baseUrl = 'https://api.trello.com/1';
    }

    public async createCardFromRoofingTemplate(
        name: string,
        videoAdUrl: string
    ): Promise<any> {
        return await this.createCardFromTemplate(
            this.roofingTemplateId,
            this.creativeRequestsListId,
            name,
            { desc: this.getRoofingCardDescription(videoAdUrl) }
        );
    }

    public getRoofingCardName(angle: string, quantity: number = 5) {
        const today = new Date();
        const month = today.toLocaleString('en-US', { month: 'short' });
        const day = today.getDate();
        return `Roofing - ${angle} - Video - ${month} ${day} (X${quantity})`;
    }

    public getRoofingCardDescription(videoAdUrl: string): string {
        return `**Instructions for a new request**

**Please put all finished videos in this folder:**
[https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing](https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing "smartCard-inline")

# Offer Name

Roofing

[https://www.swiftroofquotes.org/s/quote-1](https://www.swiftroofquotes.org/s/quote-1 "smartCard-inline")

Roofing Pay Per Lead Ad. We run traffic to the link above from Facebook, and we get paid when someone completes the form by giving us their phone number.

# Detailed Description

Please create 5 variations using different formats / styles of ads based on the example ad. The example ad is already working, we just want to give it new legs and try a different style of video.

# Link to Video
[Video Ad](${videoAdUrl})

# Type of Content

--

# Which offer is it for?

Roofing (leadgen)

# Dimensions

4:5

# Is text/copy required? Do you have any scripts?


# Additional Assets?
‌

# Examples

[Example Video Ad](${videoAdUrl})

# Date Needed

ASAP

# Partner Folder

### **Please put all finished videos in this folder:**

[**https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing**](https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing "‌")

### **IMPORTANT:**

Please name the file exactly like this:
R-AT-AT-AT-{any identifiable number from your end **do not** include the word "hook"}

Example:
R-AT-AT-AT-1098

### **Please put all finished videos in this folder:**

[**https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing**](https://drive.google.com/drive/folders/1AwBk7bOjyuBVlfTVxZ-t4wE2IatX8O22?usp=sharing "‌")

# New Creative Location

*** YOU INSERT LINK IN THE COMMENTS ***

---

**Creative Team Deliverables**

Once anyone puts a request in with all the necessary information, can you please drag this card to the "In Progress" list so he knows that his request is being worked on.

After you are done with the ads, please drag this over to the "Finished Ads" list.

# ---- For Creative Team -----

**Upon Completion**

1. Click the linked Trello card below to get to the original request
2. Add the link to the file(s) under "New Creative Location"
3. Mark due date complete
4. Tag originator of request in the comments with a "creative delivered" message

**How to deliver the ads:**

I have attached the folder below with all the clients accounts in them.
Please click on the store folder and deliver the ad creative into a folder named "ad creative".

If you do not see the folder there, please create one. Please make sure you name the ad asset appropriately with this format:

ex. Initials_Brand_Date_TypeOfVid.Version#_DiscountOrOffer_

---> jp_trajan_110221_UGC.Version1_25off`;
    }

    /**********************
     * Helper Methods
     **********************/

    private authParams(): Record<string, any> {
        return {
            key: this.apiKey,
            token: this.apiToken,
        };
    }

    private buildUrl(
        endpoint: string,
        params: Record<string, any> = {}
    ): string {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        const allParams = { ...this.authParams(), ...params };

        Object.entries(allParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, String(value));
            }
        });

        return url.toString();
    }

    private async request(
        method: string,
        endpoint: string,
        params: Record<string, any> = {}
    ): Promise<any> {
        const url = this.buildUrl(endpoint, params);
        console.log(`Making ${method} request to: ${url}`);

        const response = await fetch(url, { method });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
        }
        return response.json();
    }

    private async createCardFromTemplate(
        templateCardId: string,
        listId: string,
        name?: string,
        extraParams: Record<string, any> = {}
    ): Promise<any> {
        // Retrieve the template's checklist items (including their complete state)
        const templateChecklists = await this.getTemplateChecklistItems(
            templateCardId
        );

        // Create the new card from the template and copy the checklist structure.
        const newCard = await this.request('POST', '/cards', {
            idList: listId,
            idCardSource: templateCardId,
            keepFromSource: 'checklists',
            ...(name && { name }),
            ...extraParams,
        });

        // Retrieve the new card's checklists so we can update the checklist items.
        const newCardChecklists = await this.request(
            'GET',
            `/cards/${newCard.id}/checklists`
        );

        // Use the helper function to map and update checklist items based on the template.
        await this.updateChecklistItemsToComplete(
            newCard.id,
            templateChecklists,
            newCardChecklists
        );

        return newCard;
    }

    private async updateChecklistItemsToComplete(
        newCardId: string,
        templateChecklists: any[],
        newCardChecklists: any[]
    ): Promise<void> {
        for (const templateChecklist of templateChecklists) {
            const newChecklist = newCardChecklists.find(
                (cl: any) => cl.name === templateChecklist.name
            );
            if (newChecklist) {
                for (const templateItem of templateChecklist.checkItems) {
                    if (templateItem.state === 'complete') {
                        // Since the item IDs are assigned fresh on the new card, match by name.
                        const newItem = newChecklist.checkItems.find(
                            (item: any) => item.name === templateItem.name
                        );
                        if (newItem && newItem.state !== 'complete') {
                            const updateEndpoint = `/cards/${newCardId}/checkItem/${newItem.id}`;
                            await this.request('PUT', updateEndpoint, {
                                state: 'complete',
                            });
                        }
                    }
                }
            }
        }
    }

    private async getTemplateChecklistItems(
        templateCardId: string
    ): Promise<any[]> {
        const endpoint = `/cards/${templateCardId}/checklists`;
        return await this.request('GET', endpoint);
    }
}
