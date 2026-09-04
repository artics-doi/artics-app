import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export type DeleteChatRoomResult = {
  roomId: string;
  status: 'deleted' | 'already-deleted';
};

const deleteRoomCallable = httpsCallable<
  { roomId: string },
  DeleteChatRoomResult
>(functions, 'deleteChatRoom');

export async function deleteChatRoom(roomId: string): Promise<DeleteChatRoomResult> {
  const result = await deleteRoomCallable({ roomId });
  return result.data;
}
