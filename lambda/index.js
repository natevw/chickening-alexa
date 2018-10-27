'use strict';

process.env.TZ = 'Etc/UTC';

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

const LogEntryIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'LogEntry';
  },
  async handle(handlerInput) {
    let userId = handlerInput.requestEnvelope.session.user.userId
    let entryTime = new Date().toISOString()
    let value = +handlerInput.requestEnvelope.request.intent.slots.count.value
    
    // derive a unique id for this item (overkill! could almost index off userId+entryTime…)
    let itemId = `${md5(userId).slice(0,8)}@${Date.now()}.${process.hrtime()[1]}`
    
    // TODO: catch exception
    await documentClient.put({
      TableName : DB_TABLE,
      Item: {
        itemId, userId, entryTime, entryType:'test', value
      }
    }).promise()
    
    const speechText = 'Got new entry';
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
    let userId = handlerInput.requestEnvelope.session.user.userId
    let results = await documentClient.query({
      TableName : DB_TABLE,
      ConsistentRead: true,
      KeyConditionExpression: 'userId = :user',
      ExpressionAttributeValues: {
        ':user': userId
      }
    }).promise()
    console.log("Entries:", results.Items);
    
    const speechText = 'Got history request';
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Show Stats', speechText)
      .getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.warn(`Error handled: ${error.message}`);
    return handlerInput.responseBuilder
      .speak('Sorry, I can\'t understand the command. Please say again.')
      .reprompt('Sorry, I can\'t understand the command. Please say again.')
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LogEntryIntentHandler,
    ShowStatsIntentHandler
  )
  .addErrorHandlers(
    ErrorHandler
  )
  .lambda();
