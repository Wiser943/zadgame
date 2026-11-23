// Why a video can be flagged, in words a creator understands. Used by the admin flag dialog and by the "Learn more" sheet in the app.
const CATS = {
  unoriginal: { title: 'Unoriginal content', why: 'This video looks like it was made by someone else, or it matches a video that is already on the platform.', fix: 'Post videos you filmed or made yourself. If you added a lot of your own commentary or editing, tell us in your review request.' },
  copyright_music: { title: 'Copyrighted music', why: 'The soundtrack matches a song that is protected by copyright.', fix: 'Use your own audio or music you have the right to use. You can re-post the video with different audio.' },
  nudity: { title: 'Nudity or sexual content', why: 'Videos with nudity or sexual content are not allowed on AllConnect.', fix: 'Post something that is suitable for everyone.' },
  violence: { title: 'Violence or dangerous acts', why: 'This video shows violence, harm, or dangerous behaviour that others could copy.', fix: 'Avoid showing fights, weapons used to hurt people, or risky stunts.' },
  hate: { title: 'Hate or harassment', why: 'This video targets a person or group with hate, bullying or harassment.', fix: 'Keep videos respectful. You can disagree without attacking people.' },
  spam: { title: 'Spam or scam', why: 'This video looks like spam, a scam, or a misleading promotion.', fix: 'Do not post repeated, fake or deceptive content.' },
  misleading: { title: 'Misleading content', why: 'This video may mislead people about something important.', fix: 'Share accurate information and say clearly when something is a joke or opinion.' },
  other: { title: 'Community guidelines', why: 'This video does not follow our community guidelines.', fix: 'Read the guidelines and post something that follows them.' }
};
const LIST = Object.keys(CATS).map(k => [k, CATS[k].title]);
const cat = k => CATS[k] ? k : 'other';
const reasonText = (k, note) => (CATS[cat(k)].why + (note ? ' ' + note : '')).slice(0, 300);
module.exports = { CATS, LIST, cat, reasonText };
