import { useCallback, useReducer } from 'react';

export interface HomeModalsState {
  showNewChat: boolean;
  showNewGroup: boolean;
  showSettings: boolean;
  showProfile: boolean;
  showTheme: boolean;
  showSearch: boolean;
  showInvite: boolean;
  showDeleteConfirm: boolean;
  showUsers: boolean;
  showReleaseNotes: boolean;
  showStorageEdit: boolean;
  showNotificationSettings: boolean;
  showUserManagement: boolean;
  showDeleteUserConfirm: boolean;
}

export type HomeModalName = keyof HomeModalsState;

const initialHomeModalsState: HomeModalsState = {
  showNewChat: false,
  showNewGroup: false,
  showSettings: false,
  showProfile: false,
  showTheme: false,
  showSearch: false,
  showInvite: false,
  showDeleteConfirm: false,
  showUsers: false,
  showReleaseNotes: false,
  showStorageEdit: false,
  showNotificationSettings: false,
  showUserManagement: false,
  showDeleteUserConfirm: false
};

type HomeModalsAction =
  | { type: 'open'; name: HomeModalName }
  | { type: 'close'; name: HomeModalName }
  | { type: 'closeAll' };

function homeModalsReducer(state: HomeModalsState, action: HomeModalsAction): HomeModalsState {
  switch (action.type) {
    case 'open':
      return {
        ...state,
        [action.name]: true
      };
    case 'close':
      return {
        ...state,
        [action.name]: false
      };
    case 'closeAll':
      return { ...initialHomeModalsState };
    default:
      return state;
  }
}

export function useHomeModals() {
  const [modals, dispatch] = useReducer(homeModalsReducer, initialHomeModalsState);

  const openModal = useCallback((name: HomeModalName) => {
    dispatch({ type: 'open', name });
  }, []);

  const closeModal = useCallback((name: HomeModalName) => {
    dispatch({ type: 'close', name });
  }, []);

  const closeAll = useCallback(() => {
    dispatch({ type: 'closeAll' });
  }, []);

  return {
    modals,
    openModal,
    closeModal,
    closeAll
  };
}

export default useHomeModals;
