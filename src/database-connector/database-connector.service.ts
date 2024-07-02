import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import neo4j, { Session } from 'neo4j-driver';
import { Process } from 'src/util/util.service';

@Injectable()
export class DatabaseConnectorService {
  uri = 'bolt://localhost:7687';
  user = 'neo4j';
  password = 'testtest';

  prisma = new PrismaClient();

  constructor() {}

  async useSession<T>(runner: (session: Session) => Promise<T>): Promise<T> {
    const driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password));
    const session = driver.session();

    return runner(session)
      .catch((e) => {
        session.close();
        driver.close();

        throw new InternalServerErrorException(e.message);
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  }

  async saveProcessInstance(processName: string, processInstanceID: string): Promise<void> {
    return await this.useSession(async (s) => {
      const exists = await this.processInstanceExists(processInstanceID, s);
      if (exists) throw new ConflictException('Process Instance already exists');

      return s.run('CREATE (n:ProcessInstance {name: $name, id: $id}) RETURN n', {
        name: processName,
        id: processInstanceID
      });
    }).then(async () => {
      return this.prisma.processInstance
        .create({
          data: {
            id: processInstanceID,
            name: processName
          }
        })
        .catch((e) => {
          console.log(e);
          return undefined;
        });
    });
  }

  async addResourceToProcessInstance(processInstanceID: string, resourceName: string, resource: object): Promise<void> {
    // console.log('inside adding');
    return this.prisma.resource
      .create({
        data: {
          name: resourceName,
          payload: JSON.stringify(resource),
          parent: { connect: { id: processInstanceID } }
        }
      })
      .then(() => undefined);
  }

  async updateResourceToProcessInstance(processInstanceID: string, resourceName: string, resource: object) {
    return this.prisma.resource
      .findFirstOrThrow({
        where: {
          AND: {
            name: resourceName,
            parentId: processInstanceID
          }
        },
        orderBy: { lastUpdate: 'desc' }
      })
      .then(({ id }) => {
        return this.prisma.resource.update({
          where: { id },
          data: { payload: JSON.stringify(resource), lastUpdate: new Date() }
        });
      })
      .catch((e) => {
        if (e instanceof PrismaClientKnownRequestError && e.message === 'No Resource found')
          return this.addResourceToProcessInstance(processInstanceID, resourceName, resource);
        else throw e;
      });
  }

  async getResourcesOfTask(
    processInstanceID: string,
    resourceName: string,
    resourceStructure: Record<string, 'String' | 'Number' | 'Boolean'>
  ): Promise<Record<string, object>> {
    return this.prisma.resource
      .findMany({
        where: {
          parentId: processInstanceID,
          name: resourceName
        },
        orderBy: { lastUpdate: 'desc' },
        take: 1
      })
      .then((r) => {
        if (r.length === 0) return Object.keys(resourceStructure).reduce((agg, cur) => ({ ...agg, [cur]: null }), {});
        else return JSON.parse(r[0].payload);
      });
  }

  /** @deprecated */
  async linkResourceToProcessInstance(processInstanceID: string, resourceName: string, resource: object) {
    return await this.useSession(async (s) => {
      const result = await s.run(
        `MATCH (p:ProcessInstance {id: $pid})-[:HAS_RESOURCE]->(r:Resource {resourceName: $name}) RETURN r`,
        {
          pid: processInstanceID,
          name: resourceName
        }
      );

      if (result.records.length !== 0) {
        const elementId = result.records[0].get('r')['elementId'];

        return s.run(`MATCH (r:Resource) WHERE (elementId(r) = $elementId) SET r.data = $data RETURN r`, {
          elementId,
          data: JSON.stringify(resource)
        });
        // .then((res) => res);
      }

      return s.run(
        `MATCH (p:ProcessInstance {id: $pid}) CREATE (p)-[:HAS_RESOURCE]->(r:Resource {resourceName: $name, data: $data}) RETURN r`,
        { pid: processInstanceID, data: JSON.stringify(resource), name: resourceName }
      );
    }).then(async () => {
      return this.prisma.resource
        .create({
          data: {
            name: resourceName,
            payload: JSON.stringify(resource),
            parent: { connect: { id: processInstanceID } }
          }
        })
        .catch(async (e) => {
          if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
            // return this.prisma.resource
            //   .update({
            //     where: { parentId_name: { parentId: processInstanceID, name: resourceName } },
            //     data: { payload: JSON.stringify(resource), lastUpdate: new Date() }
            //   })
            //   .catch((e) => {
            //     console.log(e);
            //     return undefined;
            //   });
          }
          console.log(e);
          return undefined;
        });
    });
  }

  async linkProcessToParentProcess(parent: Process, child: Process): Promise<void> {
    if (parent.id === child.id) throw new ConflictException('Process Instance cannot be its own parent');

    return this.useSession(async (s) => {
      const exists = await this.processInstanceExists(child.id, s);
      if (exists) throw new ConflictException('Process Instance already exists');

      return s.run(
        'Match (p:ProcessInstance {id: $pid}) CREATE (p)-[:HAS_CHILD]->(c:ProcessInstance {id: $cid, name: $name})',
        {
          pid: parent.id,
          cid: child.id,
          name: child.name
        }
      );
    }).then(async () => {
      return this.prisma.processInstance
        .create({
          data: {
            id: child.id,
            name: child.name,
            parent: { connect: { id: parent.id } }
          }
        })
        .catch((e) => {
          console.log(e);
          return undefined;
        });
    });
  }

  async getProcessVariables(processInstanceId: string) {
    return this.prisma.processInstance.findUniqueOrThrow({
      where: { id: processInstanceId },
      include: {
        resources: true,
        childProcesses: true
      }
    });
  }

  private async processInstanceExists(processInstanceID: string, s: Session): Promise<boolean> {
    return s
      .run('MATCH (n:ProcessInstance {id: $id}) RETURN n', {
        id: processInstanceID
      })
      .then((result) => result.records.length === 1);
  }

  private async test() {
    const x = await this.useSession((s) =>
      s.run('CREATE (n:Person {name: $name, age: $age}) RETURN n', { name: 'John Doe', age: 29 })
    );
    return x.records[0].get('n').properties;
  }
}

// const createResult = await session.run('CREATE (n:Person {name: $name, age: $age}) RETURN n', {
//   name: 'John Doe',
//   age: 29
// });

// const readResult = await session.run('MATCH (n:Person {name: $name}) RETURN n', {
//   name: 'John Doe'
// })
