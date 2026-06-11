type MemberOrderItem = {
  id: string;
  order: number;
};

export type MemberOrderUpdate = {
  memberId: string;
  order: number;
};

export function buildMemberReorderUpdates(
  members: readonly MemberOrderItem[],
  activeId: string,
  overId: string,
): MemberOrderUpdate[] {
  if (activeId === overId) return [];

  const oldIndex = members.findIndex((member) => member.id === activeId);
  const newIndex = members.findIndex((member) => member.id === overId);
  if (oldIndex < 0 || newIndex < 0) return [];

  const reordered = [...members];
  const [moved] = reordered.splice(oldIndex, 1);
  if (!moved) return [];
  reordered.splice(newIndex, 0, moved);

  return reordered
    .map((member, index) => ({ memberId: member.id, order: index }))
    .filter((update) => members.find((member) => member.id === update.memberId)?.order !== update.order);
}
