import { MariaDbContainer, StartedMariaDbContainer } from '@testcontainers/mariadb'
import { GenericContainer, StartedTestContainer } from 'testcontainers'

export interface TestContainers {
  mariadb: StartedMariaDbContainer
  redis: StartedTestContainer
}

export async function startContainers(): Promise<TestContainers> {
  const [mariadb, redis] = await Promise.all([
    new MariaDbContainer('mariadb:10.11')
      .withDatabase('leverage_test')
      .withUsername('test')
      .withUserPassword('testpass')
      .start(),
    new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start(),
  ])
  return { mariadb, redis }
}

export async function stopContainers(containers: TestContainers): Promise<void> {
  await Promise.all([
    containers.mariadb.stop(),
    containers.redis.stop(),
  ])
}
