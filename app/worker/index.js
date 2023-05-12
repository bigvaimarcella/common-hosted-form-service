const indexService = require('./services/IndexService');
const redis = indexService.redisConnection();
redis.on('error', indexService.redisErrorOnConnection);
redis.on('connect', () => {
  indexService._init(redis);
});
