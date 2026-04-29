import {isNil} from 'lodash';
import {UserInfo, MyGroups} from 'openchs-models';

export const mapUser = userDetails => {
  if (isNil(userDetails)) {
    return new UserInfo();
  }
  return UserInfo.fromResource(userDetails);
};

export const mapMyUserGroups = myUserGroups => {
  if (isNil(myUserGroups)) {
    return [];
  }
  return myUserGroups.map(g => MyGroups.fromResource(g));
};