import {isNil} from 'lodash';
import {UserInfo} from 'openchs-models';

export const mapUser = userDetails => {
  if (isNil(userDetails)) {
    return new UserInfo();
  }
  return UserInfo.fromResource(userDetails);
};