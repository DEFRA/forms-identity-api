import { PublishCommand } from '@aws-sdk/client-sns'
import { getMessageAttributes } from '@defra/forms-common'

import { config } from '~/src/config/index.js'
import { logger } from '~/src/helpers/logging/logger.js'
import { getSNSClient } from '~/src/messaging/sns.js'

const snsTopicArn = config.get('snsTopicArn')

const client = getSNSClient()

/**
 * Publish event onto topic
 * @param {AuditMessage} message
 */
export async function publishEvent(message) {
  const command = new PublishCommand({
    TopicArn: snsTopicArn,
    Message: JSON.stringify(message),
    MessageAttributes: getMessageAttributes()
  })

  const result = await client.send(command)

  logger.info(`Published ${message.type} event. MessageId: ${result.MessageId}`)

  return result
}

/**
 * @import { AuditMessage } from '@defra/forms-model'
 */
