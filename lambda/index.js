'use strict';

process.env.TZ = 'Etc/UTC';

const DAY_LEN = 24*60*60*1e3;

const crypto = require('crypto'),
      Alexa = require('ask-sdk-core'),
      AWS = require('aws-sdk'),
      documentClient = new AWS.DynamoDB.DocumentClient();

const DB_TABLE = 'egg-tracker';

function md5(str) {
  const hash = crypto.createHash('md5');
  hash.update(str, 'ascii');
  return hash.digest('hex');
}

function pl(n, thing, things) {
  if (!things) things = `${thing}s`;
  return (n === 1) ? `one ${thing}` : `${n} ${things}`;
}

const LogEntryIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'LogEntry';
  },
  async handle(handlerInput) {
    let d = handlerInput.requestEnvelope;
    if (d.request.dialogState && d.request.dialogState !== 'COMPLETED') {
      return handlerInput.responseBuilder
        .addDelegateDirective(d.request.intent)
        .getResponse();
    } else if (d.request.intent.confirmationStatus === "DENIED") {
      return handlerInput.responseBuilder
        .speak("Okay, I won't record that. Standing by.")
        .reprompt("Tell me how many eggs to record, or ask me to tell the egg count.")
        .getResponse();
    }
    
    let userId = d.session.user.userId;
    let entryTime = new Date().toISOString();
    let value = +d.request.intent.slots.count.value;
    
    // derive a unique id for this item (overkill! could almost index off userId+entryTime…)
    let itemId = `${md5(userId).slice(0,8)}@${Date.now()}.${process.hrtime()[1]}`;
    
    // TODO: catch exception
    await documentClient.put({
      TableName : DB_TABLE,
      Item: {
        itemId, userId, entryTime, entryType:'collection', value
      }
    }).promise();
    
    const speechText = `Recorded ${pl(value,"egg")}.`;
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Log Entry', speechText)
      .getResponse();
  }
};

const ShowStatsIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'ShowStats';
  },
  async handle(handlerInput) {
    let userId = handlerInput.requestEnvelope.session.user.userId;
    let results = await documentClient.query({
      TableName : DB_TABLE,
      ConsistentRead: true,
      KeyConditionExpression: 'userId = :user',
      ExpressionAttributeValues: {
        ':user': userId
      }
    }).promise();
    
    let logs = results.Items
      .filter(d => d.entryType === 'collection')
      .sort((a,b) => (a.entryTime > b.entryTime) ? 1 : -1)
      .map(d => {
        let time = Date.parse(d.entryTime)
        let count = d.value
        return {time,count}
      });
    
    let now = Date.now();
    let cutoffs = {
      d: now -  1 * DAY_LEN,
      w: now -  7 * DAY_LEN,
      m: now - 30 * DAY_LEN,
      all: 0
    };
    
    let tallies = logs.reduce((sums, d) => {
      for (let [key,cut] of Object.entries(cutoffs)) {
        if (d.time > cut) sums[key] += d.count;
      }
      return sums
    }, {d:0,w:0,m:0,all:0});
    
    //console.log("Entries:", logs, tallies);
    
    let responses = [
      `You've gathered ${pl(tallies.all,"egg")} total.`
    ];
    if (tallies.m < tallies.all) {
      responses.push(`${tallies.m} in the last 30 days.`);
    }
    if (tallies.w < tallies.m) {
      responses.push(`${tallies.w} in the last week.`);
    }
    if (tallies.d < tallies.w) {
      responses.push(`${tallies.d} in the last 24 hours.`);
    }
    
    const speechText = responses.join(' ');
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Show Stats', speechText)
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput, error) {
    return handlerInput.responseBuilder
      .speak(
        "This skill keeps a logbook of when you gathered home fresh eggs. " +
        "Add entries each time you bring in more eggs, and I will add them up. " +
        "For example, \"Tell My Egg Tracker that our hens laid 9 eggs!\" " +
        "Or, you could say: \"Ask My Egg Tracker how many eggs have we gathered.\""
      )
      .reprompt("Try asking: \"How many eggs have we gathered?\"")
      .getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput, error) {
    return handlerInput.responseBuilder
      .speak("Sorry, I didn't understand that.")
      .reprompt("You can tell My Egg Tracker how many eggs you've collected.")
      .getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.warn(`Error handled: ${error.message}`, error.stack);
    return handlerInput.responseBuilder
      .speak("Hmm, something went wrong. Please try that again.")
      .reprompt("Sorry, I couldn't follow your last command. Please try again.")
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LogEntryIntentHandler,
    ShowStatsIntentHandler,
    HelpIntentHandler,
    FallbackIntentHandler
  )
  .addErrorHandlers(
    ErrorHandler
  )
  .lambda();
