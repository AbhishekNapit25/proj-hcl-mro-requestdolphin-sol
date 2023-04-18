const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
  const {
    MaintenanceRequests,
    RequestStatuses,
    WorkItems,
    BusinessPartnerVH,
    NumberRanges,
    RequestTypes
  } = this.entities;

  const service1 = await cds.connect.to('MAINTREQ_SB');
  const service2 = await cds.connect.to('NumberRangeService');

  var id1, queryStatus;

  //Read the BusinessPartnerVH Revisions entity from S4(MaintReq).
  this.on('READ', BusinessPartnerVH, req => {
    return service1.tx(req).run(req.query);
  });

  //Read NumberRanges entity from Number Range Service
  this.on('READ', NumberRanges, req => {
    return service2.tx(req).run(req.query);
  });

  this.before('CREATE', 'MaintenanceRequests', async (req) => {
    //Auto generate and auto increment the requestNo
    // var query = await SELECT.from(MaintenanceRequests).columns('max(requestNo) as requestNo')
    // req.data.requestNo++
    // req.data.requestNo = query[0].requestNo + 1

    var query = await SELECT.from(RequestTypes).columns('*').where({ rType: req.data.to_requestType_rType })
    console.log('query', query)
    var query1 = await service2.read(NumberRanges).columns('*').where({ numberRangeID: query[0].rType })
    console.log('query1 for number range', query1)

    if (query1[0] != null) {
      if (req.data.to_requestType_rType == query1[0].numberRangeID) {
        try {
          const nrID = await service2.getLastRunningNumber(query1[0].numberRangeID)
          req.data.requestNo = nrID
      } catch (error) {
          var verrorMessage = error.innererror.response.body.error.message
          req.error(406, verrorMessage)
      }
      }
    }

    //Data to be filled while creating a New Record
    req.data.to_requestStatus_rStatus = 'MRCRTD'
    req.data.to_requestStatus_rStatusDesc = 'Created'
  });

  this.before('CREATE', 'WorkItems', async (req) => {
    // Auto generate and auto increment the workItemID
    // var query = await SELECT.from(WorkItems).columns('max(workItemID) as workItemID')
    // req.data.workItemID++
    // req.data.workItemID = query[0].workItemID + 1
    
   // Generating MR Number implementing Number Range
    // var query = await SELECT.from(WorkItems).columns('*')
    //     console.log('query', query)
        var query1 = await service2.read(NumberRanges).columns('*').where({ numberRangeID: "WorkItem"})
       // req.data.to_to_workItemType_workItemType = query[0].workItemType
       // console.log('req.data.to_to_workItemType_workItemType', req.data.to_to_workItemType_workItemID)
        console.log('query1', query1)
        if (query1[0] != null) {
            const nrID = await service2.getLastRunningNumber(query1[0].numberRangeID)
            req.data.workItemID = nrID
            console.log('req.data.workItem', req.data.workItemID)
        } 
        // else {
        //     req.error(406, req.data.to_to_workItemType_workItemType + ' ID is not present in Number Range.')
        // }

  });

  this.before('NEW', 'MaintenanceRequests', async (req) => {
    req.data.expectedArrivalDate = returnDate(new Date())
    req.data.expectedDeliveryDate = returnDate(new Date())
  });

  this.on('changeStatus', async (req) => {
    id1 = req.params[0].ID
    const tx1 = cds.transaction(req)
    var query = await tx1.read(MaintenanceRequests).where({ ID: id1 })
    console.log('query', query)
    queryStatus = await tx1.read(RequestStatuses).where({ rStatusDesc: req.data.status })
    var queryStatusDisp = await tx1.read(RequestStatuses)
    console.log(req.data.status)
    console.log('queryStatus', queryStatus)

    // Request Status : Created => Request for New WorkList
    if (query[0].to_requestStatus_rStatus == 'MRCRTD' && queryStatus[0].rStatus == 'NWLREQ')
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'MRCRTD' && queryStatus[0].rStatus != 'NWLREQ')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[0].rStatusDesc)

    // Request Status : Request for New WorkList => New WorkList Requested
    else if (query[0].to_requestStatus_rStatus == 'NWLREQ' && queryStatus[0].rStatus == 'WLRQTD')
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'NWLREQ' && queryStatus[0].rStatus != 'WLRQTD' && queryStatus[0].rStatus != 'NWLREQ')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[1].rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'NWLREQ' && queryStatus[0].rStatus == 'NWLREQ')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    // Request Status : New WorkList Requested => New Worklist Received
    else if (query[0].to_requestStatus_rStatus == 'WLRQTD' && queryStatus[0].rStatus == 'NWLREC')
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'WLRQTD' && queryStatus[0].rStatus != 'NWLREC' && queryStatus[0].rStatus != 'WLRQTD')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[2].rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'WLRQTD' && queryStatus[0].rStatus == 'WLRQTD')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    // Request Status : New Worklist Received => New Worklist Screening
    else if (query[0].to_requestStatus_rStatus == 'NWLREC' && queryStatus[0].rStatus == 'NWLSCR')
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'NWLREC' && queryStatus[0].rStatus != 'NWLSCR' && queryStatus[0].rStatus != 'NWLREC')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[3].rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'NWLREC' && queryStatus[0].rStatus == 'NWLREC')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    // Request Status : New Worklist Screening => New Worklist Validated
    else if (query[0].to_requestStatus_rStatus == 'NWLSCR' && (queryStatus[0].rStatus == 'NWLVAL' || queryStatus[0].rStatus == 'NWLREC' || queryStatus[0].rStatus == 'WLRQTD' || queryStatus[0].rStatus == 'NWLREQ'))
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'NWLSCR' && (queryStatus[0].rStatus != 'NWLVAL' || queryStatus[0].rStatus != 'NWLREC' || queryStatus[0].rStatus != 'WLRQTD' || queryStatus[0].rStatus != 'NWLREQ' || queryStatus[0].rStatus != 'NWLSCR'))
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[4].rStatusDesc + ' or All the previous Statuses')

    else if (query[0].to_requestStatus_rStatus == 'NWLSCR' && queryStatus[0].rStatus == 'NWLSCR')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    // Request Status : New Worklist Validated => New Worklist Created
    else if (query[0].to_requestStatus_rStatus == 'NWLVAL' && queryStatus[0].rStatus == 'WLCRTD') {
      var queryWorkItem = await tx1.read(WorkItems).where({ requestNo: query[0].requestNo })
      console.log(queryWorkItem)
      if (queryWorkItem[0] != null) {
        updateStatus()
      }
      else {
        req.error(406, 'For Request ' + query[0].requestNo + ', WorkItem is not created.')
      }
    }
    else if (query[0].to_requestStatus_rStatus == 'NWLVAL' && queryStatus[0].rStatus != 'WLCRTD')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[5].rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'NWLVAL' && queryStatus[0].rStatus == 'NWLVAL')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    // Request Status : New Worklist Created => All Worklists Received
    else if (query[0].to_requestStatus_rStatus == 'WLCRTD' && queryStatus[0].rStatus == 'AWLREC')
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'WLCRTD' && queryStatus[0].rStatus != 'AWLREC')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[6].rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'WLCRTD' && queryStatus[0].rStatus == 'WLCRTD')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    // Request Status : All Worklists Received => Task List Identified
    else if (query[0].to_requestStatus_rStatus == 'AWLREC' && queryStatus[0].rStatus == 'TLIDNT')
      updateStatus()

    else if (query[0].to_requestStatus_rStatus == 'AWLREC' && queryStatus[0].rStatus != 'TLIDNT')
      req.error(406, 'For Request Number ' + query[0].requestNo + ', current status is ' + query[0].to_requestStatus_rStatusDesc + ' and can only proceed to next status ' + queryStatusDisp[7].rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'AWLREC' && queryStatus[0].rStatus == 'AWLREC')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)

    else if (query[0].to_requestStatus_rStatus == 'TLIDNT' && queryStatus[0].rStatus == 'TLIDNT')
      req.error(406, 'Request is already in status ' + query[0].to_requestStatus_rStatusDesc)
  })


  async function updateStatus() {
    await UPDATE(MaintenanceRequests).set({
      to_requestStatus_rStatusDesc: queryStatus[0].rStatusDesc,
      to_requestStatus_rStatus: queryStatus[0].rStatus,
    }).where({ ID: id1 })
  };


  function returnDate(dateValue) {
    var newDate = new Date(dateValue)
    var vdate = newDate.getDate();
    if (vdate.toString().length == 1) {
      vdate = '0' + vdate
    }
    var vmonth = newDate.getMonth() + 1
    if (vmonth.toString().length == 1) {
      vmonth = '0' + vmonth
    }
    var vyear = newDate.getFullYear()
    var result = String(vyear) + '-' + String(vmonth) + '-' + String(vdate)
    return result
  };
})