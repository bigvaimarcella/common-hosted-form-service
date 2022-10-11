
const { getAvailableDates, periodType } = require('../common/utils');
const exportService  = require('../form/exportService');
const emailService  = require('./emailService');
const { Form } = require('../common/models');
const moment = require('moment');
const {  EmailTypes } = require('../common/constants');
const service = {
  getCurrentPeriod(dates) {

    for (let i = 0; i <dates.length; i++) {
      var sd = moment(dates[i].startDate).format('YYYY-MM-DD');
      var gd = moment(dates[i].graceDate).format('YYYY-MM-DD');
      if(moment().isBetween(sd,gd) ) {
        return {
          state : 1,
          index: i ,
          dates: dates[i],
          old_dates : (i==0) ? null :  dates[i-1],
          late: (moment().isBetween(dates[i].closeDate, dates[i].graceDate))? 1 : 0
        };

      }
    }
    var first = dates[0];
    return {
      state: (moment().isBefore(first.startDate)) ? -1 : 0,
      index: -1,
      dates: false,
      old_dates : false,
      late: -1
    };

  },
  listDates: (schedule) =>{
    return  getAvailableDates(
      schedule.keepOpenForTerm,
      schedule.keepOpenForInterval,
      schedule.openSubmissionDateTime,
      schedule.repeatSubmission.everyTerm,
      schedule.repeatSubmission.everyIntervalType,
      schedule.allowLateSubmissions.forNext.term,
      schedule.allowLateSubmissions.forNext.intervalType,
      schedule.repeatSubmission.repeatUntil,
    );
  },
  _getForms: async ()=> {
    var fs = [];
    await Form.query()
      .modify('hasReminder')
      .modify('filterActive', true)
      .then(forms => {
        fs = forms;
      });
    return fs;
  },
  _getReminders : async (forms)=>{
    var reminder = [];
    for (let i = 0; i< forms.length; i++) {
      var obj = {};
      obj.avalaibleDate = service.listDates(forms[i].schedule);
      if (obj.avalaibleDate.length<=1) {
        reminder.push({ error:true, message : `Form ${forms[i].name }, has only one period.` });
        continue;
      }
      obj.report = service.getCurrentPeriod(obj.avalaibleDate);
      obj.form   = forms[i];
      if (obj.report.state != 1 || obj.report.index <= 0)  {
        reminder.push({ error:true, message : `Form ${forms[i].name }, we are in the first period. ` });
        continue;
      }

      obj.state = service._getMailType(obj.report, forms[i].reminder);

      if(obj.state == undefined) {
        reminder.push({ error:true, message : ` Form ${forms[i].name } ` });
        continue;
      }

      await reminder.push(
        {
          error : false,
          statement : exportService._getListSubmitersByFormId(forms[i].id, obj)
        }
      );
    }

    return reminder;
  },
  _getMailType : (report, reminder) => {
    var state = undefined;
    const now = moment().format('YYYY-MM-DD');
    const start_date = moment(report.dates.startDate).format('YYYY-MM-DD');
    var end_date = moment(report.dates.startDate).format('YYYY-MM-DD');
    if(moment(now).isSame(start_date) && reminder.enabled) {
      return EmailTypes.REMINDER_FORM_OPEN;
    }
    if(reminder.allowAdditionalNotifications && service.getNumberDayFromIntervalType(reminder.intervalType, now, start_date) ){
      return EmailTypes.REMINDER_FORM_NOT_FILL;
    }
    const yend_date = moment(end_date).subtract(1, 'day');
    if(moment(now).isSame(yend_date) && reminder.enabled){
      return EmailTypes.REMINDER_FORM_WILL_CLOSE;
    }
    return state;
  },
  getNumberDayFromIntervalType : (type, now, date)=>{
    for (const key in periodType) {
      var interval = moment(now).diff(date, periodType[key].regex);
      console.log(now, ' | ', date,'| INTERVAL '+key, interval);
      if( key==type &&  interval%periodType[key].value==0 ) {
        console.log('FOUND = > ',periodType[key]);
        return true;
      }
    }
    return false;
  },
  runQueries : async (queries) => {
    var obj = queries[2];
    obj.fillers = [];
    await queries[0].then(function(data) {
      obj.submiters = data;
    });
    if(obj.submiters && obj.submiters.length>0){
      await queries[1].then(function(data2) {
        obj.fillers = (data2) ? data2 : [];
      });
    }
    return  obj;
  },
  getDifference : async (array1, array2) => {
    return array1.filter(object1 => {
      return !array2.some(object2 => {
        return object1.userId === object2.userId;
      });
    });
  },
  _initStatement : async (obj) => {
    const statement = {};
    statement.form = obj.form;
    statement.report = obj.report;
    statement.state = obj.state;
    statement.submiters = [];

    if(!obj.submiters || obj.submiters.length == 0) return statement;

    if(statement.state != EmailTypes.REMINDER_FORM_OPEN ){
      if(obj.fillers &&  obj.fillers.length != 0 ) {
        statement.submiters = await service.getDifference(obj.submiters, obj.fillers);
      } else {
        statement.submiters = obj.submiters;
      }

    } else {
      statement.submiters = obj.submiters;
    }
    return statement;
  },

  initMaillSender: (statement) => {
    statement.submiters.forEach((element)=>{
      const data = { form :statement.form, report : statement.report, submiter : element, state : statement.state };
      emailService.initReminder(data);
    });
  }

};
module.exports = service;
