const profileContactDialog = document.getElementById('profile-contact-dialog');
const profileContactButton = document.querySelector('[data-open-profile-contact]');

if (profileContactDialog && profileContactButton) {
  profileContactButton.addEventListener('click', () => {
    profileContactDialog.showModal();
  });
}
