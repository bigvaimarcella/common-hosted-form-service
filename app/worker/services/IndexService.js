/* eslint-disable no-unused-vars */
const createClient = require('redis');
const validationService = require('./ValidationService');
const responseService = require('./responseService');
const REDIS_KEY = {
  PRE_SUB: 'pre_submissions',
  ERROR_SUB: 'error_submissions',
  SUCCESS_SUB: 'success_submissions',
};

const service = {
  _init: async (redis) => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.sleep(10000);
      const pre_submissions = await redis.ListLeftPopAsync(REDIS_KEY.PRE_SUB);
      if (pre_submissions == undefined || pre_submissions) return;
      try {
        const data = this.getPreSubmission(pre_submissions);
        if (!data) continue;
        this.validate(data, redis);
      } catch (e) {
        console.log(e);
      }
    }
  },
  getPreSubmission: (pre_submissions) => {
    try {
      return JSON.parse(pre_submissions).data;
    } catch (e) {
      console.log(e);
      return false;
    }
  },
  validate: async (data, redis) => {
    const submissions = data.submissions;
    const schema = data.schema;
    let validationResults = [];
    let successData = [];
    let errorData = [];
    let index = 0;
    await Promise.all(
      submissions.map(async (singleData) => {
        const report = await validationService.validate(singleData, schema);
        if (report !== null) {
          validationResults[index] = report;
          errorData[index] = singleData;
          index++;
        } else {
          successData.push(singleData);
        }
      })
    );
    let info = {
      formId: data.formId,
      formVerion: data.formVerion,
      createBy: data.createBy,
      isPublicForm: data.isPublicForm,
    };
    this.finalize(successData, errorData, validationResults, info, redis);
  },
  sleep: (ms) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
  finalize: (success, error, validation, info, redis) => {
    if (error.length > 0) {
      redis.rpush(REDIS_KEY.ERROR_SUB, JSON.stringify({ errors: validation, data: error, info }));
      this.populateError(redis);
    }
    if (success.length > 0) {
      redis.rpush(REDIS_KEY.SUCCESS_SUB, JSON.stringify({ data: success, info }));
      this.populateSuccess(redis);
    }
  },
  populateError: (redis) => {
    setTimeout(async () => {
      const submissions = await redis.ListLeftPopAsync(REDIS_KEY.SUCCESS_SUB);
      responseService.sendErrorData(JSON.parse(submissions));
    }, 30000);
  },
  populateSuccess: (redis) => {
    setTimeout(async () => {
      const submissions = await redis.ListLeftPopAsync(REDIS_KEY.SUCCESS_SUB);
      responseService.sendSuccessData(JSON.parse(submissions));
    }, 30000);
  },
  redisConnection: async () => {
    const client = await createClient();
    return client;
  },
  redisErrorOnConnection: (err) => {
    console.log(err);
  },
};
module.exports = service;
