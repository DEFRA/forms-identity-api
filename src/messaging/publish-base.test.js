import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { createLogContext, runWithLogContext } from '@defra/forms-common'
import { buildFormCreatedMessage } from '@defra/forms-model/stubs'
import { mockClient } from 'aws-sdk-client-mock'

import { config } from '~/src/config/index.js'
import 'aws-sdk-client-mock-jest'
import { publishEvent } from '~/src/messaging/publish-base.js'

jest.mock('~/src/config/index.js', () => {
  const testConfig = {
    awsRegion: 'eu-west-2',
    snsEndpoint: 'http://localhost',
    snsTopicArn: 'arn:aws:sns:eu-west-2:000000000000:forms_manager_events',
    log: {
      enabled: true,
      redact: ['req', 'res', 'responseTime'],
      format: 'pino-pretty',
      level: 'debug'
    }
  }
  return {
    config: {
      get: jest.fn().mockImplementation((envName) => {
        // @ts-expect-error - untyped stub return value
        return testConfig[envName]
      })
    }
  }
})

jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    info: jest.fn()
  }
}))

describe('publish-base', () => {
  const snsMock = mockClient(SNSClient)

  afterEach(() => {
    snsMock.reset()
  })

  describe('publishEvent', () => {
    // Although this audit message is not necessarily relevant to identity events,
    // we use it here to test the publishing mechanism itself.
    const message = buildFormCreatedMessage()
    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should publish', async () => {
      jest.mocked(config.get).mockReturnValue(true)
      snsMock.on(PublishCommand).resolves({
        MessageId: '00000000-0000-0000-0000-000000000000'
      })

      await publishEvent(message)
      expect(snsMock).toHaveReceivedCommandWith(PublishCommand, {
        TopicArn: 'arn:aws:sns:eu-west-2:000000000000:forms_manager_events',
        Message: JSON.stringify(message)
      })
    })

    it('should send the log context with the message', async () => {
      const context = createLogContext({
        correlationId: 'correlation-id',
        userId: 'user-id'
      })

      jest.mocked(config.get).mockReturnValue(true)
      snsMock.on(PublishCommand).resolves({
        MessageId: '00000000-0000-0000-0000-000000000000'
      })

      await runWithLogContext(context, () => publishEvent(message))
      expect(snsMock).toHaveReceivedCommandWith(PublishCommand, {
        Message: JSON.stringify(message),
        MessageAttributes: {
          correlationId: { DataType: 'String', StringValue: 'correlation-id' },
          userId: { DataType: 'String', StringValue: 'user-id' }
        }
      })
    })
  })
})
