const assert = require('assert');
const path = require('path');

function findResponse(responses, commandName) {
  return responses.find(response => response.command === commandName);
}

async function run(server) {
  const file = path.resolve(__dirname, '../project-fixture/main.ts');
  server.send({ command: 'open', arguments: { file, fileContent: 'const q = gql`query { ', scriptKindName: "TS" } });
  await server.wait(500);
  server.send({ command: 'completions', arguments: { file, offset: 22, line: 1, prefix: '' } });
  await server.wait(500);
  return server.close().then(() => {
    const completionsResponse = findResponse(server.responses, 'completions')
    assert(!!completionsResponse)
    assert.equal(completionsResponse.body.length, 3);
    assert(completionsResponse.body.some(item => item.name === 'hello'));
  });
}

module.exports = run;
